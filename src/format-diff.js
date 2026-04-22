import { IS_NODEJS, getType, pluralize, stringify } from "./util.js";
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

/** Per-side color, change-action key, and output label for diff formatting. */
const sides = {
	actual: { color: "red", action: "removed", label: " Actual:   " },
	expected: { color: "green", action: "added", label: " Expected: " },
};

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

/**
 * Format a user-supplied value as a dim "unmapped" annotation. Four styles
 * match the four layouts that carry unmapped hints.
 */
function formatUnmapped (value, style = "inline") {
	value = stripFormatting(stringify(value));
	let ret = ` <dim>(${value} unmapped)</dim>`;

	if (style === "gutter") {
		ret = `           <dim>${value} unmapped</dim>`;
	}
	else if (style === "actual") {
		ret = ` <dim>Actual unmapped:   ${value}</dim>`;
	}
	else if (style === "expected") {
		ret = ` <dim>Expected unmapped: ${value}</dim>`;
	}

	return ret;
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
	let changes = (inline ? diffChars : diffWords)(actualString, expectedString);
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

/**
 * Format one side of a change array. Whitespace-only runs get `<bg>` so
 * whitespace-only diffs stay visible.
 *
 * Without `prefix`: per-token `<c color>` wrap, common parts uncolored.
 * With `prefix`: one outer `<c color>` wraps the whole line with `prefix` in front,
 * tokens inside use plain `<b>`. Use this when a line is already committed to one side.
 */
function colorize (changes, side, prefix) {
	let { color, action } = sides[side];
	let ret = "";

	for (let change of changes) {
		if ((change.added || change.removed) && !change[action]) {
			continue;
		}

		if (!change[action]) {
			ret += change.value;
			continue;
		}

		for (let part of change.value.split(/(\s+)/)) {
			if (!part) {
				continue;
			}
			if (/^\s+$/.test(part)) {
				ret += `<bg ${ color }>${ part }</bg>`;
			}
			else {
				ret += prefix ? `<b>${ part }</b>` : `<c ${ color }><b>${ part }</b></c>`;
			}
		}
	}

	return prefix ? `<c ${ color }>${ prefix } ${ ret }</c>` : ret;
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

		for (let i = 0; i < hunk.lines.length; i++) {
			let entry = hunk.lines[i];
			let prev = hunk.lines[i - 1];
			let next = hunk.lines[i + 1];
			let after = hunk.lines[i + 2];

			// Pair only a lone `-` with a lone `+`. Multi-line blocks stay plain:
			// token-level highlighting across arbitrary alignments would mislead.
			let isolatedPair =
				entry.prefix === "-" && next?.prefix === "+"
				&& (!prev || prev.prefix !== "-")
				&& (!after || after.prefix !== "+");

			if (isolatedPair) {
				let changes = diffWords(entry.text, next.text);
				lines.push(colorize(changes, "actual", "-"));
				lines.push(colorize(changes, "expected", "+"));
				i++;
			}
			else if (entry.side === "common") {
				lines.push(`  ${ entry.text }`);
			}
			else {
				let { color } = sides[entry.side];
				lines.push(`<c ${ color }>${ entry.prefix } ${ entry.text }</c>`);
			}
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
