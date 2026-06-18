// Native Node packages
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as readline from "node:readline";

// Dependencies
import logUpdate from "log-update";
import { AsciiTree } from "oo-ascii-tree";
import { globSync } from "glob";

// Internal modules
import format, { stripFormatting } from "../format-console.js";
import { getType } from "../util.js";
import run from "../run.js";
import Test from "../classes/Test.js";
import TestResult from "../classes/TestResult.js";

// Bumped on each re-run and appended as a query param when importing test files,
// so dynamic import() bypasses the module cache and reloads fresh code.
let version = 0;

/**
 * Recursively traverse a subtree starting from `node`
 * and make groups of tests and test with console messages
 * either collapsed or expanded by setting its `collapsed` property.
 * @param {object} node - The root node of the subtree.
 * @param {boolean} collapsed - Whether to collapse or expand the subtree.
 */
function setCollapsed (node, collapsed = true) {
	if (node.tests?.length || node.messages?.length) {
		node.collapsed = collapsed;

		let nodes = [...(node.tests ?? []), ...(node.messages ?? [])];
		for (let node of nodes) {
			setCollapsed(node, collapsed);
		}
	}
}

/**
 * Recursively traverse a subtree starting from `node` and return all visible groups of tests or tests with console messages.
 */
function getVisibleGroups (node, options, groups = []) {
	groups.push(node);

	if (node.collapsed === false && node.tests?.length) {
		let tests = node.tests.filter(test => test.toString(options).collapsed !== undefined); // we are interested in groups only
		for (let test of tests) {
			getVisibleGroups(test, options, groups);
		}
	}

	return groups;
}

function getTree (msg, i) {
	if (msg.collapsed !== undefined) {
		const icons = {
			collapsed: "▷",
			expanded: "▽",
			collapsedHighlighted: "▶︎",
			expandedHighlighted: "▼",
		};

		let { collapsed, highlighted, children } = msg;

		let icon = collapsed ? icons.collapsed : icons.expanded;
		if (highlighted) {
			icon = `<c green><b>${collapsed ? icons.collapsedHighlighted : icons.expandedHighlighted}</b></c>`;
			msg = `<b>${msg}</b>`;
		}
		msg = icon + " " + msg;
		msg = new String(msg);
		msg.collapsed = collapsed;
		msg.children = collapsed ? [] : children;
	}

	return new AsciiTree(`</dim>${msg}<dim>`, ...(msg.children?.map(getTree) ?? []));
}

// Render the tests stats
function render (root, options = {}) {
	let messages = root.toString({ ...options, format: options.format ?? "rich" });
	let tree = getTree(messages).toString();
	tree = format(tree);

	logUpdate(tree);
}

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
	let paths = filenames.map(name => path.join(cwd, dir, name));

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
let watchers = [];
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

/**
 * TestResult subtrees replaced during a --watch re-run.
 * When set, {@link done} collapses only these instead of the entire tree.
 * @type {TestResult[] | null}
 */
let subtrees = null;

let keypressListener;
let isInteractive;

function saveState (node) {
	let state = { collapsed: node.collapsed, highlighted: node.highlighted };
	if (node.tests) {
		state.children = node.tests.map(saveState);
	}
	return state;
}

function restoreState (node, state) {
	node.collapsed = state.collapsed;
	node.highlighted = state.highlighted;

	if (node.tests) {
		for (let i = 0; i < node.tests.length; i++) {
			if (state.children?.[i]) {
				restoreState(node.tests[i], state.children[i]);
			}
			else {
				setCollapsed(node.tests[i]);
			}
		}
	}
}

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

async function rerun (options, urls) {
	if (keypressListener) {
		process.stdin.off("keypress", keypressListener);
	}
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

				if (Object.isExtensible(test)) {
					test.file = old.test.file;
				}

				test = new Test(test, currentRoot.test);
				currentRoot.test.tests[index] = test;

				let result = new TestResult(test, currentRoot, { ...currentRoot.options });
				currentRoot.tests[index] = result;

				currentRoot.stats.total += test.testCount;
				currentRoot.stats.pending += test.testCount;

				results.push({ result, state: saveState(old) });
			}

			hookActive = false;

			if (results.length === 0) {
				// Only deletions — no tests to run, no done/finish events will fire.
				let groups = getVisibleGroups(currentRoot, options);
				if (!groups.some(g => g.highlighted)) {
					currentRoot.highlighted = true;
				}

				render(currentRoot, options);

				if (keypressListener) {
					process.stdin.on("keypress", keypressListener);
				}
				return;
			}

			subtrees = results;

			currentRoot.finished = new Promise(resolve =>
				currentRoot.addEventListener("finish", resolve, { once: true }));

			for (let { result } of results) {
				result.runAll();
			}
			return;
		}
	}

	// Full re-run fallback
	subtrees = null;
	controller.abort();
	controller = new AbortController();
	logUpdate.clear();
	// Don't mutate options — the old tree's TestResults need to see the aborted signal.
	run(options.location, { ...options, signal: controller.signal });
}

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
					p = path.join(process.cwd(), p);
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
				if (test && typeof test === "object" && Object.isExtensible(test) && !test.file) {
					let fileUrl = new URL(url);
					fileUrl.search = "";
					test.file = {
						label: path.relative(
							isDirectory ? location : path.dirname(location),
							fileURLToPath(url),
						),
						path: fileUrl.href,
					};
				}
			}),
		);

		return tests;
	},
	setup (options) {
		process.env.NODE_ENV = "test";
		options.signal ??= controller.signal; // so the first run's tree can be aborted by rerun()
		isInteractive = !options.ci && process.stdout.isTTY && process.stdin.isTTY;

		if (!options.watch || watchers.length || !isInteractive) {
			return;
		}

		let toWatch = [...new Set([...loadedFiles].map(url => path.dirname(fileURLToPath(url))))];

		watchers = toWatch.map(dir =>
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
			}));
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

		if (subtrees) {
			for (let { result, state } of subtrees) {
				restoreState(result, state);
			}
		}
		else {
			setCollapsed(root); // all groups and console messages are collapsed by default
		}

		if (root.stats.pending > 0) {
			render(root, options);
		}
		else {
			let active;

			if (subtrees) {
				// --watch re-run complete: preserve UI state, just re-attach navigation
				subtrees = null;

				let groups = getVisibleGroups(root, options);
				if (!groups.some(g => g.highlighted)) {
					root.highlighted = true;
				}

				active = groups.find(g => g.highlighted) ?? root;
			}
			else {
				// Fresh tree: full interactive setup
				if (version === 0) {
					// Print the hint once, on the first run. Re-runs keep this committed copy in place
					// and refresh the tree below it instead of stacking a new hint each time.
					logUpdate.clear();

					let hint = `
Use <b>↑</b> and <b>↓</b> arrow keys to navigate groups of tests, <b>→</b> and <b>←</b> to expand and collapse them, respectively.
Use <b>Ctrl+↑</b> and <b>Ctrl+↓</b> to go to the first or last child group of the current group.
To expand or collapse the current group and all its subgroups, use <b>Ctrl+→</b> and <b>Ctrl+←</b>.
Press <b>Ctrl+Shift+→</b> and <b>Ctrl+Shift+←</b> to expand or collapse all groups, regardless of the current group.
Press <b>o</b> to open the source file of the current group.
Press <b>r</b> to re-run all tests (picks up file changes).
Use <b>any other key</b> to quit interactive mode.
${options.watch ? "\n<b>Watching for file changes…</b>" : ""}
`;
					hint = format(hint);
					// Why not console.log(hint)? Because we don't want to mess up other console messages produced by tests,
					// especially the async ones.
					logUpdate(hint);
					logUpdate.done();
				}

				readline.emitKeypressEvents(process.stdin);
				process.stdin.setRawMode(true); // handle keypress events instead of Node

				root.highlighted = true;
				active = root;
			}

			render(root, options);

			keypressListener = (character, key) => {
				let name = key.name;

				if (name === "up") {
					// Figure out what group of tests is active (and should be highlighted)
					let groups = getVisibleGroups(root, options);

					if (key.ctrl) {
						let parent = active.parent;
						if (parent) {
							active = groups.filter(group => group.parent === parent)[0]; // the first one from all groups with the same parent
						}
					}
					else {
						let index = groups.indexOf(active);
						index = Math.max(0, index - 1); // choose the previous group, but don't go higher than the root
						active = groups[index];
					}

					for (let group of groups) {
						group.highlighted = false;
					}
					active.highlighted = true;
					render(root, options);
				}
				else if (name === "down") {
					let groups = getVisibleGroups(root, options);

					if (key.ctrl) {
						let parent = active.parent;
						if (parent) {
							active = groups.filter(group => group.parent === parent).at(-1); // the last one from all groups with the same parent
						}
					}
					else {
						let index = groups.indexOf(active);
						index = Math.min(groups.length - 1, index + 1); // choose the next group, but don't go lower than the last one
						active = groups[index];
					}

					for (let group of groups) {
						group.highlighted = false;
					}
					active.highlighted = true;
					render(root, options);
				}
				else if (name === "left") {
					if (key.ctrl && key.shift) {
						// Collapse all groups on Ctrl+Shift+←
						let groups = getVisibleGroups(root, options);
						for (let group of groups) {
							group.highlighted = false;
						}

						setCollapsed(root);
						active = root;
						active.highlighted = true;
						render(root, options);
					}
					else if (key.ctrl) {
						// Collapse the current group and all its subgroups on Ctrl+←
						setCollapsed(active);
						render(root, options);
					}
					else if (active.collapsed === false) {
						active.collapsed = true;
						render(root, options);
					}
					else if (active.parent) {
						// If the current group is collapsed, collapse its parent group
						let groups = getVisibleGroups(root, options);
						let index = groups.indexOf(active.parent);
						active = groups[index];
						active.collapsed = true;

						for (let group of groups) {
							group.highlighted = false;
						}
						active.highlighted = true;
						render(root, options);
					}
				}
				else if (name === "right") {
					if (key.ctrl && key.shift) {
						// Expand all groups on Ctrl+Shift+→
						setCollapsed(root, false);
						render(root, options);
					}
					else if (key.ctrl) {
						// Expand the current group and all its subgroups on Ctrl+→
						setCollapsed(active, false);
						render(root, options);
					}
					else if (active.collapsed === true) {
						active.collapsed = false;
						render(root, options);
					}
				}
				else if (name === "o") {
					let file = active.test?.file?.path;
					if (file) {
						try {
							if (process.platform === "win32") {
								execFileSync("cmd", ["/c", "start", "", file], {
									stdio: "inherit",
								});
							}
							else {
								let command = process.platform === "darwin" ? "open" : "xdg-open";
								execFileSync(command, ["--", file], { stdio: "inherit" });
							}
						}
						catch {}
						render(root, options);
					}
				}
				else if (name === "r") {
					rerun(options);
				}
				else {
					// Quit interactive mode on any other key
					for (let watcher of watchers) {
						watcher.close();
					}
					logUpdate.done();
					process.exit();
				}
			};
			process.stdin.on("keypress", keypressListener);
		}

		currentRoot = root;

		if (root.stats.fail > 0) {
			process.exitCode = 1;
		}
	},
};
