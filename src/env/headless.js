import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { globSync } from "glob";
import TestResult from "../classes/TestResult.js";
import nodeEnv from "./node.js";
import { getType, serializeError } from "../util.js";

const filenamePatterns = {
	include: /\.js$/,
	exclude: /^index/,
};

function toUrlPath (filePath, root) {
	let absolute = path.resolve(root, filePath);
	let relative = path.relative(root, absolute);
	let normalized = relative.split(path.sep).join("/");
	return "/" + normalized;
}

function collectFilePaths (location, root) {
	let absolute = path.resolve(root, location);

	if (fs.existsSync(absolute)) {
		let stat = fs.statSync(absolute);
		if (stat.isDirectory()) {
			let entries = fs.readdirSync(absolute)
				.filter(name => !filenamePatterns.exclude.test(name) && filenamePatterns.include.test(name))
				.map(name => path.join(absolute, name));
			return entries;
		}

		return [absolute];
	}

	let matches = globSync(location, { nodir: true, cwd: root });
	return matches.map(match => path.join(root, match));
}

function resolveTestUrls (test, root) {
	let type = getType(test);

	if (type === "string") {
		return collectFilePaths(test, root).map(p => toUrlPath(p, root));
	}

	if (Array.isArray(test)) {
		let flattened = test.flatMap(item => {
			if (getType(item) !== "string") {
				throw new Error("Headless runner only supports string test locations.");
			}
			return collectFilePaths(item, root);
		});
		return flattened.map(p => toUrlPath(p, root));
	}

	throw new Error("Headless runner only supports string test locations.");
}

function escapeJson (value) {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

function createRunnerHtml ({ testUrls, options }) {
	let testsJson = escapeJson(testUrls);
	let optionsJson = escapeJson(options);

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<title>hTest Headless Runner</title>
</head>
<body>
	<script id="htest_tests">${ testsJson }</script>
	<script id="htest_options">${ optionsJson }</script>
	<script type="module">
		import run from "/src/run.js";
		import { subsetTests } from "/src/util.js";

		try {
			const tests = JSON.parse(htest_tests.textContent);
			const options = JSON.parse(htest_options.textContent);

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
					sendProgress(result.toJSON());
				}
			});

			await result.finished;
			sendResult(result.toJSON());
		}
		catch (error) {
			sendError({
				message: error.message,
				stack: error.stack,
			});
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
		throw new Error("Headless runner requires Playwright. Install with `npm i -D playwright`.");
	}
}

function resolveBrowserConfig (browserName) {
	let name = (browserName || "chromium").toLowerCase();

	switch (name) {
		case "chromium":
		case "firefox":
		case "webkit":
			return { browserType: name, channel: null, installName: name };
		case "chrome":
			return { browserType: "chromium", channel: "chrome", installName: "chrome" };
		case "edge":
		case "msedge":
			return { browserType: "chromium", channel: "msedge", installName: "msedge" };
		default:
			throw new Error(`Unsupported browser "${browserName}". Use chromium, firefox, webkit, chrome, or edge.`);
	}
}

function createInstallHint (installName) {
	if (!installName) {
		return `Run "npx playwright install" to install browsers.`;
	}

	return `Run "npx playwright install ${installName}" to install the browser binary.`;
}

export default {
	name: "Headless",
	defaultOptions: {
		browser: "chromium",
		headless: true,
		serverRoot: process.cwd(),
	},
	async run (test, options = {}) {
		let root = path.resolve(options.serverRoot ?? process.cwd());
		let testUrls = resolveTestUrls(test, root);
		if (testUrls.length === 0) {
			throw new Error("No tests found for headless run.");
		}

		let browserName = options.browser ?? "chromium";
		let browserOptions = {
			only: options.only,
			verbose: options.verbose,
			path: options.path,
		};

		let html = createRunnerHtml({
			testUrls,
			options: browserOptions,
		});

		let { server, baseUrl } = await startServer({ root, html });
		let browser;

		try {
			let playwright = await loadPlaywright();
			let { browserType, channel, installName } = resolveBrowserConfig(browserName);
			let browserTypeApi = playwright[browserType];
			if (!browserTypeApi) {
				throw new Error(`Unsupported browser "${browserName}".`);
			}
			try {
				browser = await browserTypeApi.launch({
					headless: options.headless !== false,
					channel: channel ?? undefined,
				});
			}
			catch (err) {
				let hint = createInstallHint(installName);
				err.message = `${err.message}\n${hint}`;
				throw err;
			}
			let page = await browser.newPage();

			let resolveResult;
			let rejectResult;
			let resultPromise = new Promise((resolve, reject) => {
				resolveResult = resolve;
				rejectResult = reject;
			});

			await page.exposeFunction("sendResult", payload => {
				resolveResult(payload);
			});
			await page.exposeFunction("sendProgress", payload => {
				if (payload?.stats?.pending <= 0) {
					return;
				}
				let progress = TestResult.fromJSON(payload, options);
				nodeEnv.done?.(progress, options, null, progress);
			});
			await page.exposeFunction("sendError", payload => {
				let err = new Error(payload?.message || "Headless runner failed.");
				err.stack = payload?.stack;
				rejectResult(err);
			});

			page.on("pageerror", err => {
				rejectResult(err);
			});

			await page.goto(`${ baseUrl }/index.html`, { waitUntil: "load" });
			let payload = await resultPromise;

			let result = TestResult.fromJSON(payload, options);
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
