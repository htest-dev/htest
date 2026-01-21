import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { globSync } from "glob";
import nodeEnv from "./node.js";
import { deserializeResult, serializeError } from "../headless-util.js";

const filenamePatterns = {
	include: /\.js$/,
	exclude: /^index/,
};

function resolvePath (filePath, root) {
	let absolute = path.resolve(root, filePath);
	let relative = path.relative(root, absolute);
	let normalized = relative.split(path.sep).join("/");
	return "/" + normalized;
}

function getTestPaths (location, root) {
	let resolvedPath = path.resolve(root, location);

	if (fs.existsSync(resolvedPath)) {
		let stat = fs.statSync(resolvedPath);
		if (stat.isDirectory()) {
			return fs.readdirSync(resolvedPath)
				.filter(name => !filenamePatterns.exclude.test(name) && filenamePatterns.include.test(name))
				.map(name => path.join(resolvedPath, name));
		}

		return [resolvedPath];
	}

	let matches = globSync(location, { nodir: true, cwd: root });
	return matches.map(match => path.join(root, match));
}

function resolveTestPaths (test, root) {
	if (typeof test === "string") {
		return getTestPaths(test, root).map(p => resolvePath(p, root));
	}

	if (Array.isArray(test)) {
		let flattened = test.flatMap(item => {
			if (typeof item !== "string") {
				throw new Error("Headless runner only supports string test locations.");
			}
			return getTestPaths(item, root);
		});
		return flattened.map(p => resolvePath(p, root));
	}

	throw new Error("Headless runner only supports string test locations.");
}

function escape (str) {
	return str.replace(/</g, "&lt;");
}

function getRunnerHtml ({ tests, options }) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>hTest Headless Runner</title>
</head>
<body>
	<script type="application/json" id="htest-tests">${ escape(JSON.stringify(tests)) }</script>
	<script type="application/json" id="htest-options">${ escape(JSON.stringify(options)) }</script>
	<script type="module">
		import run from "/src/run.js";
		import { subsetTests } from "/src/util.js";
		import { serializeError, serializeResult } from "/src/headless-util.js";

		try {
			globalThis.__HTEST_HEADLESS__ = true;

			const tests = JSON.parse(document.getElementById("htest-tests").textContent);
			const options = JSON.parse(document.getElementById("htest-options").textContent);

			const modules = await Promise.all(tests.map(url => import(url).then(m => m.default ?? m)));
			let test = modules.length === 1 ? modules[0] : modules;

			if (options.path) {
				subsetTests(test, options.path);
			}

			const result = run(test, {
				only: options.only,
				verbose: options.verbose,
				env: { name: "Headless Browser" },
			});

			result.addEventListener("done", () => {
				if (result.stats?.pending > 0) {
					sendProgress(serializeResult(result));
				}
			});

			await result.finished;
			sendResult(serializeResult(result));
		}
		catch (error) {
			sendError(serializeError(error));
		}
	</script>
</body>
</html>`;
}

async function startServer ({ root, html }) {
	return new Promise((resolve, reject) => {
		let server = http.createServer((req, res) => {
			let url = new URL(req.url, "http://localhost");

			if (url.pathname === "/index.html") {
				res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
				res.end(html);
				return;
			}

			let decodedPath = decodeURIComponent(url.pathname);
			let filePath = path.resolve(root, "." + decodedPath);

			if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
				res.writeHead(404);
				res.end("Not found");
				return;
			}

			res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
			fs.createReadStream(filePath).pipe(res);
		});

		server.on("error", reject);
		server.listen(0, "127.0.0.1", () => {
			let address = server.address();
			resolve({
				server,
				baseUrl: `http://127.0.0.1:${address.port}`,
			});
		});
	});
}

async function loadPlaywright () {
	try {
		return await import("playwright");
	}
	catch (err) {
		throw new Error(`Headless runner requires Playwright. Install with "npm i -D playwright".`);
	}
}

function getConfig (name = "chromium") {
	let originalName = name;
	name = name.toLowerCase();

	switch (name) {
		case "chromium":
		case "firefox":
		case "webkit":
			return { type: name, name };
		case "chrome":
			return { type: "chromium", channel: "chrome", name: "chrome" };
		case "edge":
		case "msedge":
			return { type: "chromium", channel: "msedge", name: "msedge" };
		default:
			throw new Error(`Unsupported browser "${originalName}". Use chromium, firefox, webkit, chrome, or edge.`);
	}
}

export default {
	name: "Headless",
	defaultOptions: {
		browser: "chromium",
		get serverRoot () {
			return process.cwd();
		},
	},
	async run (test, options = {}) {
		let root = path.resolve(options.serverRoot);
		let tests = resolveTestPaths(test, root);
		if (tests.length === 0) {
			throw new Error("No tests found for headless run.");
		}

		let html = getRunnerHtml({ tests, options });

		let { server, baseUrl } = await startServer({ root, html });
		let browser;

		try {
			let playwright = await loadPlaywright();
			let { type, channel, name } = getConfig(options.browser);
			browser = playwright[type];
			if (!browser) {
				throw new Error(`Unsupported browser "${options.browser}".`);
			}
			try {
				console.info(`Launching headless browser...\n`);
				browser = await browser.launch({ headless: true, channel });
			}
			catch (err) {
				browser = null;
				throw err;
			}
			let page = await browser.newPage();

			let resolveResult;
			let rejectResult;
			let resultPromise = new Promise((resolve, reject) => {
				resolveResult = resolve;
				rejectResult = reject;
			});
			let timeout = options.timeout ?? 30000;
			let timer;
			let timeoutPromise = new Promise((_, reject) => {
				timer = setTimeout(() => {
					reject(new Error(`Headless runner timed out after ${timeout}ms.`));
				}, timeout);
			});

			await page.exposeFunction("sendResult", payload => {
				resolveResult(payload);
			});
			await page.exposeFunction("sendProgress", payload => {
				if (payload?.stats?.pending <= 0) {
					return;
				}
				let progress = deserializeResult(payload, options);
				nodeEnv.done?.(progress, options, null, progress);
			});
			await page.exposeFunction("sendError", payload => {
				let err = new Error(payload?.message || "Headless runner failed.");
				if (payload?.name) {
					err.name = payload.name;
				}
				err.stack = payload?.stack;
				rejectResult(err);
			});

			page.on("pageerror", err => {
				rejectResult(err);
			});

			await page.goto(`${ baseUrl }/index.html`, { waitUntil: "load" });
			let payload = await Promise.race([resultPromise, timeoutPromise]);
			clearTimeout(timer);

			let result = deserializeResult(payload, options);
			nodeEnv.done?.(result, options, null, result);
			return result;
		}
		catch (err) {
			err.meta = serializeError(err);
			throw err;
		}
		finally {
			if (browser) {
				await browser.close();
			}

			server.close();
		}
	},
};
