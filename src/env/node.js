// Native Node packages
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as readline from "node:readline";

// Dependencies
import logUpdate from "log-update";
import { AsciiTree } from "oo-ascii-tree";
import { globSync } from "glob";

// Internal modules
import format from "../format-console.js";
import { getType } from "../util.js";

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

		let {collapsed, highlighted, children} = msg;

		let icon = collapsed ? icons.collapsed : icons.expanded;
		if (highlighted) {
			icon = `<c green><b>${ collapsed ? icons.collapsedHighlighted : icons.expandedHighlighted }</b></c>`;
			msg = `<b>${ msg }</b>`;
		}
		msg = icon + " " + msg;
		msg = new String(msg);
		msg.collapsed = collapsed;
		msg.children = collapsed ? [] : children;
	}

	return new AsciiTree(`</dim>${ msg }<dim>`, ...(msg.children?.map(getTree) ?? []));
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
	let filenames = fs.readdirSync(dir).filter(name => !filenamePatterns.exclude.test(name) && filenamePatterns.include.test(name));
	let cwd = process.cwd();
	let paths = filenames.map(name => path.join(cwd, dir, name));

	return Promise.all(paths.map(path => import(pathToFileURL(path)).then(module => module.default, err => {
		console.error(`Error importing tests from ${path}:`, err);
	})));
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
		if (fs.statSync(location).isDirectory()) {
			// Directory provided, fetch all files
			return getTestsIn(location);
		}
		else { // Probably a glob
			// Convert paths to imported modules
			let modules = globSync(location).flatMap(paths => {
				// Convert paths to imported modules
				paths = getType(paths) === "string" ? [paths] : paths;
				return paths.map(p => {
					p = path.join(process.cwd(), p);
					return import(pathToFileURL(p)).then(m => m.default ?? m);
				});
			});

			return Promise.all(modules);
		}

	},
	setup () {
		process.env.NODE_ENV = "test";
	},
	done (result, options, event, root) {
		if (options.ci) {
			if (root.stats.pending === 0) {
				if (root.stats.fail > 0 || options.verbose) {
					let messages = root.toString(options);
					let tree = getTree(messages).toString();
					tree = format(tree);

					console[root.stats.fail > 0 ? "error" : "log"](tree);
					process.exit(root.stats.fail > 0 ? 1 : 0);
				}

				process.exit(0);
			}
		}
		else {
			setCollapsed(root); // all groups and console messages are collapsed by default
			render(root, options);

			if (root.stats.pending === 0) {
				logUpdate.clear();

				let hint = `
Use <b>↑</b> and <b>↓</b> arrow keys to navigate groups of tests, <b>→</b> and <b>←</b> to expand and collapse them, respectively.
Use <b>Ctrl+↑</b> and <b>Ctrl+↓</b> to go to the first or last child group of the current group.
To expand or collapse the current group and all its subgroups, use <b>Ctrl+→</b> and <b>Ctrl+←</b>.
Press <b>Ctrl+Shift+→</b> and <b>Ctrl+Shift+←</b> to expand or collapse all groups, regardless of the current group.
Use <b>any other key</b> to quit interactive mode.
`;
				hint = format(hint);
				// Why not console.log(hint)? Because we don't want to mess up other console messages produced by tests,
				// especially the async ones.
				logUpdate(hint);
				logUpdate.done();

				readline.emitKeypressEvents(process.stdin);
				process.stdin.setRawMode(true); // handle keypress events instead of Node

				root.highlighted = true;
				render(root, options);

				let active = root; // active (highlighted) group of tests that can be expanded/collapsed; root by default
				process.stdin.on("keypress", (character, key) => {
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

							groups = groups.map(group => group.highlighted = false);
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
					else {
						// Quit interactive mode on any other key
						logUpdate.done();
						process.exit();
					}
				});
			}

			if (root.stats.fail > 0) {
				process.exitCode = 1;
			}
		}
	},
};
