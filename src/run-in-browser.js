// Native Node packages
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { readFile } from "node:fs/promises";

// Dependencies
import logUpdate, { logUpdateStderr } from "log-update";
import { globSync } from "glob";

// Internal modules
import env from "./env/node.js";
import Test from "./classes/Test.js";
import TestResult from "./classes/TestResult.js";
import format, { stripFormatting } from "./format-console.js";
import { getType } from "./util.js";

let defaultOptions = {
	browser: "chromium",
	headless: true,
	format: "rich",
};

const filenamePatterns = {
	include: /\.m?js$/,
	exclude: /^index/,
};

export default async function run (location, options = {}) {
	options = {
		...defaultOptions,
		...options,
	};

	let filePaths;
	if (fs.statSync(location).isDirectory()) {
		// Directory provided, fetch all file paths
		let filenames = fs.readdirSync(location).filter(name => !filenamePatterns.exclude.test(name) && filenamePatterns.include.test(name));
		filePaths = filenames.map(name => path.join(process.cwd(), location, name));
	}
	else {
		// Probably a glob
		filePaths = globSync(location).flatMap(paths => {
			paths = getType(paths) === "string" ? [paths] : paths;
			return paths.map(p => path.join(process.cwd(), p));
		});
	}

	let tests;
	if (filePaths.length === 1) {
		let path = filePaths[0];
		tests = `
			let tests = await import("./${ path }").then(m => m.default).catch(err => {
				console.error("Error importing tests from ${ path }:", err);
				return null;
			});
		`;
	}
	else {
		tests = [];

		filePaths.forEach((path, index) => {
			tests.push(`
				let test_${index} = await import("./${ path }").then(m => m.default).catch(err => {
					console.error("Error importing tests from ${ path }:", err);
					return null;
				});
			`);
		});

		// Don't choke on tests that should run in Node (e.g., if they import a native Node module), ignore them
		tests = tests.filter(Boolean);
		tests = tests.join("\n") + `
			let tests = {
				tests: [
					${ tests.map((_, index) => `test_${index}`).join(",\n") }
				]
			};
		`;
	}

	let originalBrowser = options.browser;
	let browser = originalBrowser.toLowerCase();

	if (!["chromium", "firefox", "webkit"].includes(browser)) {
		throw new Error(
			`Browser "${ originalBrowser }" not found. Try running "npm install @playwright/browser-${ browser }".`,
		);
	}

	logUpdate("Launching browser...");

	browser = await import("playwright-core").then(module => module[browser]);
	browser = await browser.launch({ headless: options.headless });
	let context = await browser.newContext();
	let page = await context.newPage();

	// Echo console messages to Node
	// TODO: associate each message with a test it belongs to
	page.on("console", message => {
		let text = message.text();
		text = options.format === "rich" ? format(text) : stripFormatting(text);
		logUpdate(text);
	});

	// TODO: Don't echo page errors during the test run. Show a summary at the end.
	page.on("pageerror", console.error);

	// Create a local HTTP server to serve test files to the browser.
	// This allows importing modules from the filesystem via http://localhost
	let server = http.createServer(async (req, res) => {
		// Add CORS headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

		try {
			// Decode URL to handle special characters
			let url = decodeURIComponent(req.url);

			// Remove leading slash and let path.normalize handle separators
			url = url.replace(/^\//, "");
			url = path.normalize(url);

			// Resolve the file location safely
			let filePath = path.resolve(process.cwd(), url);

			let content = await readFile(filePath, "utf-8");
			res.setHeader("Content-Type", "application/javascript");
			res.end(content);
		}
		catch (error) {
			console.error(`Failed to serve: ${req.url}`, error);
			res.statusCode = 404;
			res.end();
		}
	});

	// Listen on port 0 to let the OS assign a random available port
	await new Promise(resolve => server.listen(0, resolve));
	let port = server.address().port;

	await page.setContent(`
		<!DOCTYPE html>
		<html>
			<head>
				<base href="http://localhost:${ port }/" />
				<meta charset="UTF-8" />
				<title>Tests</title>
			</head>
			<body>
				<script type="module">
					import Test from "./src/classes/Test.js";
					import TestResult from "./src/classes/TestResult.js";
					${ tests }

					let root = new Test(tests);
					let result = new TestResult(root);

					result.addEventListener("done", async () => {
						// Show a progress bar
						let { total, pending } = result.stats;
						let progress = (total - pending) / total;

						let width = 30;
						let filled = Math.floor(progress * width);
						let empty = width - filled;
						let bar = "█".repeat(filled) + "░".repeat(empty);

						console.log("Running tests... <c green>" + bar + "</c> ", Math.floor(progress * 100) + "%");
					});

					result.addEventListener("finish", () => {
						// Expose the results to Node
						window.result = result;

						document.body.style.setProperty("--done", "true");
					});

					result.runAll();
				</script>
			</body>
		</html>
	`);

	await page.waitForFunction(() => document.body.style.getPropertyValue("--done") === "true", { timeout: 10000 });

	// Get the result from the browser
	// It will be serialized to JSON, so we need to restore the prototype chain later
	let result = await page.evaluate(() => window.result);

	logUpdate.clear();

	await browser.close();
	server.close();

	// Set TestResult prototype for the root and restore its entire tree
	restorePrototype(result, TestResult.prototype);

	// Output the result
	env.done(undefined, options, undefined, result);
}

// Recursively restore prototype chain
function restorePrototype (obj, prototype) {
	Object.setPrototypeOf(obj, prototype);

	// For TestResult objects, restore their test property
	if (prototype === TestResult.prototype && obj.test) {
		restorePrototype(obj.test, Test.prototype);
	}

	obj.tests?.forEach(test => restorePrototype(test, prototype));

	return obj;
}
