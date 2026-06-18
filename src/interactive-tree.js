import { execFileSync } from "node:child_process";
import process from "node:process";
import * as readline from "node:readline";

import ansiEscapes from "ansi-escapes";
import { AsciiTree } from "oo-ascii-tree";
import stringWidth from "string-width";

import format from "./format-console.js";

// Constants / UI config

const icons = {
	collapsed: "▷",
	expanded: "▽",
	collapsedHighlighted: "▶︎",
	expandedHighlighted: "▼",
};

let hint = {
	full: `Use <b>↑</b> and <b>↓</b> to navigate groups, <b>→</b> and <b>←</b> to expand/collapse.
<b>Ctrl+↑</b>/<b>↓</b> — first/last in group. <b>Ctrl+→</b>/<b>←</b> — expand/collapse subgroups.
<b>Ctrl+Shift+→</b>/<b>←</b> — expand/collapse all.

<b>o</b> open source file · <b>r</b> re-run tests · <b>any other key</b> quit.`,
	compact: `<dim>Press <b>h</b> to toggle help.</dim>`,
	expanded: false,
	get text () {
		return this.expanded ? this.full : this.compact;
	},
};

let fullscreen = {
	active: false,
	toggle (on) {
		if (on === this.active) {
			return;
		}

		this.active = on;
		process.stdout.write(
			on
				? ansiEscapes.enterAlternativeScreen + ansiEscapes.cursorHide
				: ansiEscapes.cursorShow + ansiEscapes.exitAlternativeScreen,
		);
	},
};

// Tree building

/**
 * Convert the message tree from `TestResult.toString()` into a printable ASCII tree.
 * Also records where the highlighted group lands in the output (`highlight`)
 * so the viewport knows what to keep visible.
 * @param {object} msg
 * @param {object} [highlight]
 * @param {number} [parent]
 * @param {object} [state]
 * @returns {AsciiTree}
 */
export function getTree (msg, highlight = {}, parent = -1, state = { line: 0, seek: false }) {
	let at = state.line;
	let group = msg.collapsed !== undefined;
	let highlighted = group && msg.highlighted;
	let children = msg.collapsed ? [] : msg.children;

	if (group && state.seek && !highlighted) {
		highlight.next = at;
		state.seek = false;
	}

	if (highlighted) {
		highlight.line = at;
		highlight.parent = parent;
		state.seek = true;
	}

	if (group) {
		let icon = msg.collapsed ? icons.collapsed : icons.expanded;
		if (highlighted) {
			icon = `<c green><b>${msg.collapsed ? icons.collapsedHighlighted : icons.expandedHighlighted}</b></c>`;
			msg = `<b>${msg}</b>`;
		}
		msg = icon + " " + msg;
	}

	state.line += String(msg).split("\n").length;
	let nodes = children?.map(child => getTree(child, highlight, group ? at : parent, state)) ?? [];

	if (highlighted) {
		highlight.end = state.line;
	}

	// Tree renders inside a dim context; turn dim OFF for content, back ON for tree-drawing chars (├──, └──)
	return new AsciiTree(`</dim>${msg}<dim>`, ...nodes);
}

export function setCollapsed (node, collapsed = true) {
	if (node.tests?.length || node.messages?.length) {
		node.collapsed = collapsed;

		let nodes = [...(node.tests ?? []), ...(node.messages ?? [])];
		for (let node of nodes) {
			setCollapsed(node, collapsed);
		}
	}
}

// Viewport math

/** How many lines fit in the viewport starting at `from`? Returns the index past the last visible line. */
function getViewportEnd (heights, from, budget) {
	let to = from,
		used = 0;
	while (to < heights.length && used + heights[to] <= budget) {
		used += heights[to++];
	}
	return to;
}

/** Where should the viewport start to end at `to`? Returns the first line index that fits. */
function getViewportStart (heights, to, budget) {
	let from = to,
		used = 0;
	while (from > 0 && used + heights[from - 1] <= budget) {
		used += heights[--from];
	}
	return from;
}

/**
 * Compute the visible window. Keeps the previous scroll position and only shifts
 * when the highlighted group would be off-screen — nearby navigation feels stable,
 * jumping far re-centers naturally.
 */
function getViewport ({ heights, highlightStart, highlightEnd, scroll = 0, budget }) {
	let start = Math.min(scroll, highlightStart);

	if (highlightEnd > getViewportEnd(heights, start, budget)) {
		start = Math.min(highlightStart, getViewportStart(heights, highlightEnd, budget));
	}

	return { start, end: Math.max(getViewportEnd(heights, start, budget), start + 1) };
}

// Session state — reset per fresh root (via `initialized` WeakSet), persisted across done() calls

/** First visible line index in the viewport. */
let scroll;

/**
 * Intra-group scroll offset. When a group's expanded content is taller than the viewport,
 * the extra lines are hidden — up/down page through them before moving to the next group.
 */
let offset;

/** Last computed viewport: { highlightStart, next, start, end }. Used by up/down paging. */
let viewport;

/** The currently highlighted (keyboard-navigable) group. */
let active;

let resizeListener, keypressListener;

// Watch state

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

/**
 * TestResult subtrees replaced during a --watch partial re-run.
 * Set by {@link prepareRerun}, consumed by {@link interactiveTree} to restore UI state.
 * @type {Array | null}
 */
let subtrees = null;

export function prepareRerun (results) {
	subtrees = results.map(({ result, old }) => ({ result, state: saveState(old) }));
}

// Navigation

/** Collect all groups reachable by keyboard navigation (expanded ancestors). */
function getNavigableGroups (node, options, groups = []) {
	groups.push(node);

	if (node.collapsed === false && node.tests?.length) {
		let tests = node.tests.filter(test => test.toString(options).collapsed !== undefined); // groups only
		for (let test of tests) {
			getNavigableGroups(test, options, groups);
		}
	}

	return groups;
}

function handleKeypress (root, options, rerun, key) {
	let name = key.name;

	if (name === "up") {
		// Oversized group: page up through its content before moving to the previous group
		if (!key.ctrl && offset > 0) {
			offset = Math.max(0, offset - (viewport.end - viewport.start));
			render(root, options);
			return;
		}

		let groups = getNavigableGroups(root, options);
		offset = 0;

		if (key.ctrl) {
			let parent = active.parent;
			if (parent) {
				active = groups.filter(group => group.parent === parent)[0]; // the first one from all groups with the same parent
			}
		}
		else {
			let index = groups.indexOf(active);
			index = Math.max(0, index - 1); // don't go higher than the root
			active = groups[index];
		}

		for (let group of groups) {
			group.highlighted = false;
		}
		active.highlighted = true;
		render(root, options);
	}
	else if (name === "down") {
		// Oversized group: page down through hidden content before advancing to the next group
		if (!key.ctrl && viewport?.end < viewport?.next) {
			offset = viewport.end - viewport.highlightStart;
			render(root, options);
			return;
		}

		let groups = getNavigableGroups(root, options);
		offset = 0;

		if (key.ctrl) {
			let parent = active.parent;
			if (parent) {
				active = groups.filter(group => group.parent === parent).at(-1); // the last one from all groups with the same parent
			}
		}
		else {
			let index = groups.indexOf(active);
			index = Math.min(groups.length - 1, index + 1); // don't go lower than the last one
			active = groups[index];
		}

		for (let group of groups) {
			group.highlighted = false;
		}
		active.highlighted = true;
		render(root, options);
	}
	else if (name === "left") {
		offset = 0; // collapsing changes the layout — drop any intra-group scroll

		if (key.ctrl && key.shift) {
			// Collapse all groups
			let groups = getNavigableGroups(root, options);
			for (let group of groups) {
				group.highlighted = false;
			}

			setCollapsed(root);
			active = root;
			active.highlighted = true;
			render(root, options);
		}
		else if (key.ctrl) {
			// Collapse the current group and all its subgroups
			setCollapsed(active);
			render(root, options);
		}
		else if (active.collapsed === false) {
			active.collapsed = true;
			render(root, options);
		}
		else if (active.parent) {
			// Already collapsed — collapse the parent group instead
			let groups = getNavigableGroups(root, options);
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
		offset = 0; // expanding changes the layout — drop any intra-group scroll

		if (key.ctrl && key.shift) {
			// Expand all groups
			setCollapsed(root, false);
			render(root, options);
		}
		else if (key.ctrl) {
			// Expand the current group and all its subgroups
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
					execFileSync("cmd", ["/c", "start", "", file], { stdio: "inherit" });
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
	else if (name === "h") {
		hint.expanded = !hint.expanded;
		render(root, options);
	}
	else if (name === "r") {
		offset = 0;
		rerun();
	}
	else {
		// Quit: exit alt screen, print final tree, clean up
		fullscreen.toggle(false);

		let messages = root.toString(options);
		let tree = getTree(messages).toString();
		console.log(format(tree));

		process.exit();
	}
}

// Rendering + entry point

function render (root, options) {
	let messages = root.toString({ ...options, format: options.format ?? "rich" });

	let highlight = {}; // where the highlighted group sits in the rendered tree, so the viewport can track it
	let tree = format(getTree(messages, highlight).toString());

	let terminalRows = line => Math.max(1, Math.ceil(stringWidth(line) / process.stdout.columns));

	let header =
		"\n" + hint.text + (options.watch ? "\n\n<b>Watching for file changes…</b>" : "") + "\n\n";
	header = format(header);
	let headerRows = header.split("\n").reduce((rows, line) => rows + terminalRows(line), 0) - 1;
	let budget = Math.max(1, process.stdout.rows - headerRows);

	let lines = tree.split("\n");
	let heights = lines.map(terminalRows);

	let highlightStart = highlight.line ?? 0;
	let highlightEnd = highlight.end ?? highlightStart + 1;
	let next = highlight.next ?? highlightEnd;
	let parent = highlight.parent ?? -1;

	let start,
		end,
		pinned = -1;

	if (offset > 0) {
		pinned = highlightStart;
		let available = budget - heights[highlightStart] - 1;
		start = Math.min(
			highlightStart + offset,
			Math.max(highlightStart, getViewportStart(heights, next, available)),
		);
		end = Math.max(Math.min(getViewportEnd(heights, start, available), next), start + 1);
	}
	else {
		({ start, end } = getViewport({ heights, highlightStart, highlightEnd, scroll, budget }));

		if (parent > 0 && parent < start && budget > heights[parent] + 1) {
			pinned = parent;
			({ start, end } = getViewport({
				heights,
				highlightStart,
				highlightEnd,
				scroll,
				budget: budget - heights[parent] - 1,
			}));
		}
	}

	// Sticky parent header: when the highlighted group's parent scrolled off the top,
	// pin it above the viewport so the user keeps context.
	pinned = pinned < 0 ? "" : "\x1b[2m" + lines[pinned] + "\n ⋮\n";

	scroll = start;
	viewport = { highlightStart, next, start, end };

	process.stdout.write(
		ansiEscapes.cursorTo(0, 0) +
			ansiEscapes.eraseScreen +
			"\x1b[0m" + // consistent formatting: header at normal brightness
			header +
			pinned +
			"\x1b[2m" + // consistent formatting: tree lines dim
			lines.slice(start, end).join("\n"),
	);
}

/**
 * Roots already seen by {@link interactiveTree}. A new root triggers
 * scroll reset and initial collapse; a known root preserves UI state.
 * @type {WeakSet<object>}
 */
let initialized = new WeakSet();

/**
 * Interactive test results viewer.
 * Called from `done()` on every test completion event in interactive mode.
 * @param {object} root - The root TestResult.
 * @param {object} options - Test runner options.
 * @param {object} callbacks
 * @param {Function} callbacks.rerun - Trigger a test re-run.
 */
export default function interactiveTree (root, options, { rerun }) {
	if (keypressListener) {
		process.stdin.off("keypress", keypressListener);
		keypressListener = null;
	}

	if (subtrees) {
		for (let { result, state } of subtrees) {
			restoreState(result, state);
		}
		if (root.stats.pending === 0) {
			subtrees = null;
		}
	}

	if (!fullscreen.active) {
		fullscreen.toggle(true);
	}

	if (!initialized.has(root)) {
		scroll = 0;
		offset = 0;
		viewport = {};
		setCollapsed(root); // all groups and console messages are collapsed by default
		initialized.add(root);
	}

	if (resizeListener) {
		process.stdout.off("resize", resizeListener);
	}
	resizeListener = () => render(root, options);
	process.stdout.on("resize", resizeListener);

	render(root, options);

	if (root.stats.pending === 0 && !keypressListener) {
		readline.emitKeypressEvents(process.stdin);
		process.stdin.setRawMode(true); // handle keypress events instead of Node

		let groups = getNavigableGroups(root, options);
		if (groups.some(g => g.highlighted)) {
			active = groups.find(g => g.highlighted);
		}
		else {
			active = root;
			root.highlighted = true;
		}

		render(root, options);

		keypressListener = (_, key) => handleKeypress(root, options, rerun, key);
		process.stdin.on("keypress", keypressListener);
	}

	if (root.stats.fail > 0) {
		process.exitCode = 1;
	}
}

// Cleanup

process.on("exit", () => {
	if (process.stdout.isTTY) {
		fullscreen.toggle(false);
	}
});
