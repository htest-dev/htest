import { IS_NODEJS, getType, pluralize, stringify } from "../util.js";
import { stripFormatting } from "./format-console.js";

// Dual Node/browser import. Kept version in the CDN URL in sync with package.json.
// `diffWordsWithSpace` keeps whitespace as part of token boundaries so the
// reconstructed string matches the input; plain `diffWords` collapses it.
const { diffChars, diffLines, diffWordsWithSpace: diffWords } = await import(
	IS_NODEJS
		? "diff"
		: "https://cdn.jsdelivr.net/npm/diff@8.0.4/lib/index.es6.js"
);

/** @typedef {{value: string, added?: boolean, removed?: boolean}} Change */

/** Unchanged lines kept around each change (diff context). */
const CONTEXT = 2;

/** Longer single-line text switches to two-line word-diff layout. */
const INLINE_MAX = 40;

/** Per-side chunk/line bg tokens, change-action key, and output label for diff formatting. */
const sides = {
	actual: { chunk: "diff-removed-emph", line: "diff-removed", action: "removed", label: " Actual:   " },
	expected: { chunk: "diff-added-emph", line: "diff-added", action: "added", label: " Expected: " },
};

/**
 * Post-process `diffChars` output to merge short coincidental common runs into
 * surrounding edits. A common chunk survives as a boundary iff it's longer
 * than the edits on *either* adjacent side — if it's shorter than both, the
 * whole region (commons + edits between two boundaries) collapses to one
 * removed + one added block.
 * @param {Change[]} changes
 * @returns {Change[]}
 */
function cleanup (changes) {
	let boundary = changes.map(() => false);
	for (let i = 0; i < changes.length; i++) {
		let change = changes[i];
		if (change.added || change.removed) {
			continue;
		}
		let before = 0;
		for (let j = i - 1; j >= 0 && (changes[j].added || changes[j].removed); j--) {
			before += changes[j].value.length;
		}
		let after = 0;
		for (let j = i + 1; j < changes.length && (changes[j].added || changes[j].removed); j++) {
			after += changes[j].value.length;
		}
		if (change.value.length > before || change.value.length > after) {
			boundary[i] = true;
		}
	}

	let ret = [];
	let i = 0;
	while (i < changes.length) {
		if (boundary[i]) {
			ret.push(changes[i++]);
			continue;
		}
		let removed = "", added = "";
		while (i < changes.length && !boundary[i]) {
			let change = changes[i++];
			if (change.removed) {
				removed += change.value;
			}
			else if (change.added) {
				added += change.value;
			}
			else {
				removed += change.value;
				added += change.value;
			}
		}
		if (removed) {
			ret.push({ value: removed, removed: true });
		}
		if (added) {
			ret.push({ value: added, added: true });
		}
	}
	return ret;
}

/**
 * Format a failure message comparing `actual` to `expected`, choosing a layout
 * based on value shape: inline char-diff for short values, two-line word-diff
 * for long single-line text, unified `-`/`+` hunks for multi-line stringified
 * values, and plain side-by-side for type mismatches or stringify collisions.
 * @param {*} actual - Value produced by the test.
 * @param {*} expected - Value the test expected.
 * @param {{ actual?: *, expected?: * }} [unmapped] - Pre-`map` values to annotate
 *   alongside the diff; each side is optional and only rendered when present.
 * @returns {string} Formatted message with `format-console` tags.
 */
export function formatDiff (actual, expected, unmapped = {}) {
	let actualType = getType(actual);
	let expectedType = getType(expected);

	if (actualType !== expectedType) {
		return typeMismatch(actual, expected, actualType, expectedType, unmapped);
	}

	let actualString = stringify(actual);
	let expectedString = stringify(expected);

	if (actualString === expectedString) {
		let actualLabel = sides.actual.label;
		let expectedLabel = sides.expected.label;

		return [
			`${ actualLabel }${ actualString } <dim>(${ actualType })</dim>`,
			`${ expectedLabel }${ expectedString } <dim>(${ expectedType })</dim>`,
			` <dim>(values are stringified identically but not equal)</dim>`,
		].join("\n");
	}

	if (actualString.includes("\n") || expectedString.includes("\n")) {
		return lineDiff(actualString, expectedString, unmapped);
	}

	let long =
		Math.max(actualString.length, expectedString.length) > INLINE_MAX
		&& actualString.includes(" ") && expectedString.includes(" ");

	return sideBySide(actualString, expectedString, unmapped, !long);
}

function typeMismatch (actual, expected, actualType, expectedType, unmapped) {
	let values = { actual, expected };
	let lines = [`Got ${ actualType }, expected ${ expectedType }`];

	for (let side in sides) {
		let { label } = sides[side];
		let line = label + stringify(values[side]);

		if (side in unmapped) {
			line += formatUnmapped(unmapped[side]);
		}

		lines.push(line);
	}

	return lines.join("\n");
}

/**
 * Inline (`Got X, expected Y`) or two-line (` Actual:` / ` Expected:`) layout,
 * driven by char-diff or word-diff depending on `inline`.
 */
function sideBySide (actualString, expectedString, unmapped, inline) {
	let changes = inline
		? cleanup(diffChars(actualString, expectedString))
		: diffWords(actualString, expectedString);
	let actual = colorize(changes, "actual");
	let expected = colorize(changes, "expected");

	if (inline) {
		let left = `Got ${ actual }`;
		if ("actual" in unmapped) {
			left += formatUnmapped(unmapped.actual);
		}

		let right = `expected ${ expected }`;
		if ("expected" in unmapped) {
			right += formatUnmapped(unmapped.expected);
		}

		return `${ left }, ${ right }`;
	}

	let formatted = { actual, expected };
	let lines = [];

	for (let side in sides) {
		let { label } = sides[side];

		lines.push(label + formatted[side]);
		if (side in unmapped) {
			lines.push(formatUnmapped(unmapped[side], "gutter"));
		}
	}

	return "\n" + lines.join("\n");
}

function lineDiff (actualString, expectedString, unmapped) {
	// Flatten diffLines output to one entry per line. Each chunk ends with a
	// trailing `\n`; splitting produces a spurious empty tail we drop.
	let entries = [];
	for (let change of diffLines(actualString, expectedString)) {
		let prefix = change.added ? "+" : change.removed ? "-" : " ";
		let side = change.added ? "expected" : change.removed ? "actual" : "common";
		let texts = change.value.split("\n");
		if (texts.at(-1) === "") {
			texts.pop();
		}
		for (let text of texts) {
			entries.push({ prefix, text, side });
		}
	}

	let hunks = extractHunks(entries);
	let lines = [" Actual ↔ Expected:"];

	for (let hunk of hunks) {
		if (hunk.elidedBefore > 0) {
			lines.push(elision(hunk.elidedBefore));
		}

		let i = 0;
		while (i < hunk.lines.length) {
			let entry = hunk.lines[i];

			if (entry.side === "common") {
				lines.push(`  ${ entry.text }`);
				i++;
				continue;
			}

			let removed = [];
			while (i < hunk.lines.length && hunk.lines[i].prefix === "-") {
				removed.push(hunk.lines[i++]);
			}
			let added = [];
			while (i < hunk.lines.length && hunk.lines[i].prefix === "+") {
				added.push(hunk.lines[i++]);
			}

			lines.push(...formatBlock(removed, added));
		}
	}

	let lastHunk = hunks.at(-1);
	if (lastHunk?.elidedAfter > 0) {
		lines.push(elision(lastHunk.elidedAfter));
	}

	for (let [side, value] of Object.entries(unmapped)) {
		lines.push(formatUnmapped(value, side));
	}

	return "\n" + lines.join("\n");
}

/**
 * Format one side of a change array. Every changed run gets `<bg {chunk}><b>`
 * so all diffs — whitespace, token, or char — carry the same visual primitive.
 *
 * Without `prefix`: returns mixed common/changed text; caller decides line framing.
 * With `prefix`: wraps the whole line in `<bg {line}>` with `prefix` in front;
 * chunk bgs inside stack over the line bg so changed chars pop while the rest
 * of the line keeps a faint "this line changed" tint.
 */
function colorize (changes, side, prefix) {
	let { chunk, line, action } = sides[side];
	let ret = "";

	for (let change of changes) {
		if ((change.added || change.removed) && !change[action]) {
			continue;
		}

		if (change[action]) {
			ret += `<bg ${ chunk }><b>${ change.value }</b></bg>`;
		}
		else {
			ret += change.value;
		}
	}

	return prefix ? `<bg ${ line }>${ prefix } ${ ret }</bg>` : ret;
}

/**
 * Format a `-` block followed by a `+` block. When counts match, emit
 * interleaved char-diffed pairs — `cleanup` ensures dissimilar pairs
 * collapse to a single red + single green block automatically, so no similarity
 * threshold is needed. Unequal counts (pure add, pure remove, or mixed
 * mismatched) fall back to a plain sequence: all removes, then all adds.
 */
function formatBlock (removed, added) {
	if (removed.length === added.length) {
		let lines = [];
		for (let i = 0; i < removed.length; i++) {
			let changes = cleanup(diffChars(removed[i].text, added[i].text));
			lines.push(colorize(changes, "actual", "-"));
			lines.push(colorize(changes, "expected", "+"));
		}
		return lines;
	}

	return [...removed, ...added].map(entry => {
		let action = sides[entry.side].action;
		return colorize([{ value: entry.text, [action]: true }], entry.side, entry.prefix);
	});
}

/**
 * Format a user-supplied value as a dim "unmapped" annotation. Four styles
 * match the four layouts that carry unmapped hints.
 */
function formatUnmapped (value, style = "inline") {
	value = stripFormatting(stringify(value));
	let ret = ` <dim>(${ value } unmapped)</dim>`;

	if (style === "gutter") {
		ret = `           <dim>${ value } unmapped</dim>`;
	}
	else if (style === "actual") {
		ret = ` <dim>Actual unmapped:   ${ value }</dim>`;
	}
	else if (style === "expected") {
		ret = ` <dim>Expected unmapped: ${ value }</dim>`;
	}

	return ret;
}

function elision (count) {
	return `  <dim>… ${ count } matching ${ pluralize(count, "line", "lines") } …</dim>`;
}

/**
 * Group changed entries with up to `CONTEXT` common lines on each side.
 * Overlapping windows merge; gaps ≤ `2 * CONTEXT + 1` stay in place (an
 * elision marker would take as many rows as the lines it hides).
 */
function extractHunks (entries) {
	let last = entries.length - 1;
	let merged = [];
	for (let i = 0; i < entries.length; i++) {
		if (entries[i].side === "common") {
			continue;
		}
		let start = Math.max(0, i - CONTEXT);
		let end = Math.min(last, i + CONTEXT);
		let prev = merged.at(-1);
		if (prev && start - prev[1] <= 1) {
			// Windows overlap or touch — fold into the previous hunk.
			prev[1] = Math.max(prev[1], end);
		}
		else {
			merged.push([start, end]);
		}
	}
	if (merged.length === 0) {
		return [];
	}

	let hunks = merged.map(([start, end], i) => {
		let prevEnd = i === 0 ? -1 : merged[i - 1][1];
		let elidedBefore = start - prevEnd - 1;
		// Leading common lines that fit in the context budget get shown —
		// the marker would take as many rows as the lines it would hide.
		if (i === 0 && elidedBefore <= CONTEXT) {
			start = 0;
			elidedBefore = 0;
		}
		return { lines: entries.slice(start, end + 1), elidedBefore, elidedAfter: 0 };
	});

	let [lastStart, lastEnd] = merged.at(-1);
	let trailing = last - lastEnd;
	if (trailing > CONTEXT) {
		hunks.at(-1).elidedAfter = trailing;
	}
	else {
		hunks.at(-1).lines = entries.slice(lastStart);
	}

	return hunks;
}
