// Native Node packages
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Dependencies
import { globSync } from "glob";

// Internal modules
import interactiveTree, { getTree, prepareRerun } from "../interactive-tree.js";
import format, { stripFormatting } from "../format-console.js";
import { getType } from "../util.js";
import run from "../run.js";
import Test from "../classes/Test.js";
import TestResult from "../classes/TestResult.js";

// Bumped on each re-run and appended as a query param when importing test files,
// so dynamic import() bypasses the module cache and reloads fresh code.
let version = 0;

// Set up environment for Node
const filenamePatterns = {
	include: /\.m?js$/,
	exclude: /^index/,
};

async function getTestsIn (dir) {
	let filenames = fs
		.readdirSync(dir)
		.filter(
			name => !filenamePatterns.exclude.test(name) && filenamePatterns.include.test(name),
		);
	let cwd = process.cwd();
	let paths = filenames.map(name => path.resolve(cwd, dir, name));

	return (
		await Promise.all(
			paths.map(path => {
				path = pathToFileURL(path);
				loadedFiles.add(path.href);
				return import(path).then(
					module => module.default ?? Object.values(module),
					err => {
						console.error(`Error importing tests from ${path}:`, err);
					},
				);
			}),
		)
	).flat();
}

// AbortSignal (not a plain boolean) because runAll() shallow-copies options per child —
// a shared object reference is needed for the abort to be visible across the tree.
let controller = new AbortController();
let debounceTimer;
let watchers = new Map();
let loadedFiles = new Set();

/**
 * Files that changed since the last --watch re-run.
 * The watcher collects URLs here; {@link rerun} drains the set on each re-run.
 * @type {Set<string>}
 */
let changed = new Set();

/**
 * Reverse dependency graph: maps each imported file to the set of files that depend on it.
 * Keys and values are base file URLs (no query params).
 * Built by the resolve hook, used to map a changed source file to affected test files.
 * @type {Map<string, Set<string>>}
 */
let deps = new Map();

/**
 * Module resolve hook from `node:module`.
 * Registered once on first resolveLocation call, never deregistered — process exit cleans up.
 * Active only when {@link hookActive} is true; inert during test execution.
 */
let hook;
let hookActive = false;

/**
 * The root TestResult from the last finished test run.
 * A --watch re-run swaps children in this tree instead of creating a new one.
 * @type {TestResult | undefined}
 */
let currentRoot;

let isInteractive;

function getAffectedFiles (urls) {
	let rootPath = currentRoot.test.file?.path;
	let files = new Set(currentRoot.tests.map(c => c.test.file?.path).filter(Boolean));
	let affected = new Set();

	for (let url of urls) {
		if (url === rootPath || (!files.has(url) && !deps.has(url))) {
			return null;
		}

		let queue = [url];
		let visited = new Set(queue);

		for (let i = 0; i < queue.length; i++) {
			let current = queue[i];

			if (files.has(current)) {
				affected.add(current);
			}
			else {
				for (let importer of deps.get(current) ?? []) {
					if (!visited.has(importer)) {
						visited.add(importer);
						queue.push(importer);
					}
				}
			}
		}
	}

	return affected.size > 0 ? [...affected] : null;
}

function syncWatchers (options) {
	if (!options.watch || !isInteractive) {
		return;
	}

	for (let url of loadedFiles) {
		let dir = path.dirname(fileURLToPath(url));
		if (watchers.has(dir)) {
			continue;
		}

		watchers.set(
			dir,
			fs.watch(dir, (eventType, filename) => {
				if (!filename || !filenamePatterns.include.test(filename)) {
					return;
				}

				// Editors often fire multiple events per save (temp file + rename); debounce to batch them
				changed.add(pathToFileURL(path.join(dir, filename)).href);
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					let files = [...changed];
					changed.clear();
					rerun(options, files);
				}, 200);
			}),
		);
	}
}

async function rerun (options, urls) {
	version++;

	if (urls && currentRoot?.stats.pending === 0) {
		let files = getAffectedFiles(urls);
		if (files) {
			hookActive = true;

			let results = [];

			for (let url of files) {
				let index = currentRoot.tests.findIndex(c => c.test.file?.path === url);
				let old = currentRoot.tests[index];

				if (!fs.existsSync(fileURLToPath(url))) {
					// File was deleted — subtract stats and remove the subtree
					for (let key of Object.keys(old.stats)) {
						currentRoot.stats[key] -= old.stats[key];
					}
					currentRoot.timeTaken -= old.timeTaken;
					if (old.timeTakenAsync) {
						currentRoot.timeTakenAsync =
							(currentRoot.timeTakenAsync ?? 0) - old.timeTakenAsync;
					}

					currentRoot.test.tests.splice(index, 1);
					currentRoot.tests.splice(index, 1);
					continue;
				}

				// Import before mutating stats — on error, keep the old subtree intact
				let uncached = new URL(url);
				uncached.searchParams.set("htest", version);

				let module;
				try {
					module = await import(uncached.href);
				}
				catch (err) {
					console.error(`Error importing ${url}:`, err);
					continue;
				}

				// Subtract old stats, swap in the new subtree
				for (let key of Object.keys(old.stats)) {
					currentRoot.stats[key] -= old.stats[key];
				}
				currentRoot.timeTaken -= old.timeTaken;
				if (old.timeTakenAsync) {
					currentRoot.timeTakenAsync =
						(currentRoot.timeTakenAsync ?? 0) - old.timeTakenAsync;
				}

				let test = module.default ?? Object.values(module);

				if (old.test.file && typeof test === "object") {
					Test.files.set(test, old.test.file);
				}

				test = new Test(test, currentRoot.test);
				currentRoot.test.tests[index] = test;

				let result = new TestResult(test, currentRoot, { ...currentRoot.options });
				currentRoot.tests[index] = result;

				currentRoot.stats.total += test.testCount;
				currentRoot.stats.pending += test.testCount;

				results.push({ result, old });
			}

			hookActive = false;
			syncWatchers(options);

			if (results.length === 0) {
				// Only deletions — no tests to run, no done/finish events will fire.
				interactiveTree(currentRoot, options, { rerun: () => rerun(options) });
				return;
			}

			prepareRerun(results);

			currentRoot.finished = new Promise(resolve =>
				currentRoot.addEventListener("finish", resolve, { once: true }));

			for (let { result } of results) {
				result.runAll();
			}
			return;
		}
	}

	// Full re-run fallback
	controller.abort();
	controller = new AbortController();
	// Don't mutate options — the old tree's TestResults need to see the aborted signal.
	run(options.location, { ...options, signal: controller.signal });
}

process.on("exit", () => {
	for (let watcher of watchers.values()) {
		watcher.close();
	}
});

export default {
	name: "Node.js",
	defaultOptions: {
		format: "rich",
		get location () {
			return process.cwd();
		},
	},
	resolveLocation: async function (location) {
		loadedFiles.clear();
		deps.clear();

		// Resolve hook: record dependency edges for --watch re-run, track each test's source file
		// for tagging, and on re-run (version > 0) append ?htest=<version> to file: URLs so the
		// module graph reloads fresh. registerHooks needs Node ≥ 22.15; dynamic import + ?. no-op below that.
		let { registerHooks } = await import("node:module");
		hook ??= registerHooks?.({
			resolve (specifier, context, nextResolve) {
				let resolved = nextResolve(specifier, context);

				if (
					!hookActive ||
					!resolved.url.startsWith("file:") ||
					resolved.url.includes("/node_modules/")
				) {
					return resolved;
				}

				let baseUrl = new URL(resolved.url);
				baseUrl.search = "";

				if (context.parentURL) {
					let parentUrl = new URL(context.parentURL);
					parentUrl.search = "";
					let importers = deps.get(baseUrl.href);
					if (!importers) {
						importers = new Set();
						deps.set(baseUrl.href, importers);
					}
					importers.add(parentUrl.href);
				}

				if (version > 0) {
					baseUrl.searchParams.set("htest", version);
					resolved = { ...resolved, url: baseUrl.href, shortCircuit: true };
				}

				loadedFiles.add(resolved.url);

				return resolved;
			},
		});

		hookActive = true;

		let tests;
		let isDirectory = fs.statSync(location, { throwIfNoEntry: false })?.isDirectory();
		if (isDirectory) {
			// Directory provided, fetch all files
			tests = await getTestsIn(location);
		}
		else {
			// Probably a glob
			// Convert paths to imported modules
			let modules = globSync(location).flatMap(paths => {
				// Convert paths to imported modules
				paths = getType(paths) === "string" ? [paths] : paths;
				return paths.map(p => {
					p = path.resolve(process.cwd(), p);
					p = pathToFileURL(p);
					loadedFiles.add(p.href);
					return import(p).then(m => m.default ?? Object.values(m));
				});
			});
			tests = (await Promise.all(modules)).flat();
		}

		hookActive = false;

		// Tag each module's default with its source file. Re-imports return the cached namespace — no I/O.
		await Promise.all(
			[...loadedFiles].map(async url => {
				let module = await import(url);
				let test = module.default ?? module;
				if (test && typeof test === "object") {
					let fileUrl = new URL(url);
					fileUrl.search = "";
					Test.files.set(test, {
						label: path.relative(
							isDirectory ? location : path.dirname(location),
							fileURLToPath(url),
						),
						path: fileUrl.href,
					});
				}
			}),
		);

		return tests;
	},
	setup (options) {
		process.env.NODE_ENV = "test";
		options.signal ??= controller.signal; // so the first run's tree can be aborted by rerun()

		// Interactive mode requires both a TTY stdout (for cursor control) and a TTY stdin (for raw keypress events).
		// The --ci flag explicitly opts into non-interactive mode regardless of TTY state.
		isInteractive = !options.ci && process.stdout.isTTY && process.stdin.isTTY;

		syncWatchers(options);
	},
	start (target, options, event, root) {
		// `start` bubbles — skip descendants so we only fire once, on the root's own start.
		if (options.signal?.aborted || !isInteractive || target !== root) {
			return;
		}

		currentRoot = root;
		// Open the interactive tree now so progress shows immediately — otherwise nothing renders until the first `done` event.
		interactiveTree(root, options, { rerun: () => rerun(options) });
	},
	done (result, options, event, root) {
		if (options.signal?.aborted) {
			return;
		}

		if (!isInteractive) {
			if (root.stats.pending === 0) {
				let messages = root.toString(options);
				let tree = getTree(messages).toString();
				tree = process.stdout.isTTY ? format(tree) : stripFormatting(tree);

				console[root.stats.fail > 0 ? "error" : "log"](tree);

				process.exit(root.stats.fail > 0 ? 1 : 0);
			}
			return;
		}

		currentRoot = root;
		interactiveTree(root, options, { rerun: () => rerun(options) });
	},
};
