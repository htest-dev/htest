/**
 * Format console text with HTML-like tags.
 *
 * Modes:
 *   - "truecolor" / "256" / "strip" — ANSI backend (default on Node).
 *   - "css" — returns [text, ...styles] for console.log spread (default on browser).
 */

import { IS_NODEJS } from "../util.js";
import palette from "./palette.js";

// `reset` is internal-only — not matched by tagRegex, used by emitAnsi's replay.
const modifiers = {
	reset: { ansi: "\x1b[0m" },
	b: { ansi: "\x1b[1m", css: "font-weight: bold" },
	i: { ansi: "\x1b[3m", css: "font-style: italic" },
	dim: { ansi: "\x1b[2m", css: "opacity: 0.6" },
};

const tagRegex = /<\/?(b|i|dim|c|bg)(?:\s+([\w#-]+))?\s*>/gi;

/**
 * Detect format mode from an env-like object. Browser falls back to "css" (CSS backend).
 * Pure — takes env as argument for testability; default path is cached in `detectedMode`.
 * @param {Record<string, string | undefined> | null} [env]
 * @returns {"truecolor" | "256" | "strip" | "css"}
 */
function detectMode (env = IS_NODEJS ? process.env : null) {
	if (!env) {
		return "css";
	}

	let ret = "256"; // env.FORCE_COLOR === "2" || env.FORCE_COLOR === "1" || no env;

	if (env.NO_COLOR || env.FORCE_COLOR === "0") {
		ret = "strip";
	}
	else if (
		env.FORCE_COLOR === "3" ||
		env.COLORTERM === "truecolor" ||
		env.COLORTERM === "24bit" ||
		/-truecolor|-direct|-24bit/.test(env.TERM ?? "")
	) {
		ret = "truecolor";
	}

	return ret;
}

const detectedMode = detectMode();

/**
 * Resolve a color name to a hex value.
 * Accepts semantic tokens, base names, and hex literals.
 */
function resolveColor (name) {
	if (palette[name]) {
		return palette[name];
	}
	if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(name)) {
		return name;
	}
	return null;
}

function parseHex (hex) {
	hex = hex.replace("#", "");
	if (hex.length === 3) {
		hex = hex
			.split("")
			.map(c => c + c)
			.join("");
	}
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}

function ansiTruecolor (hex, { bg } = {}) {
	let { r, g, b } = parseHex(hex);
	return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
}

// Reference points of the xterm 6×6×6 color cube (indices 16–231).
const cubeLevels = [0, 95, 135, 175, 215, 255];

function quantize (value) {
	let best = 0;
	let bestDelta = Infinity;
	for (let i = 0; i < cubeLevels.length; i++) {
		let delta = Math.abs(value - cubeLevels[i]);
		if (delta < bestDelta) {
			bestDelta = delta;
			best = i;
		}
	}
	return best;
}

function ansi256 (hex, { bg } = {}) {
	let { r, g, b } = parseHex(hex);
	let index = 16 + 36 * quantize(r) + 6 * quantize(g) + quantize(b);
	return `\x1b[${bg ? 48 : 38};5;${index}m`;
}

/**
 * Tokenize a tagged string into a stream of { type, tag, value } records.
 */
function tokenize (str) {
	let tokens = [];
	let lastIndex = 0;
	for (let match of str.matchAll(tagRegex)) {
		if (match.index > lastIndex) {
			tokens.push({ type: "text", value: str.slice(lastIndex, match.index) });
		}
		let isClose = match[0].startsWith("</");
		tokens.push({
			type: isClose ? "close" : "open",
			tag: match[1].toLowerCase(),
			value: match[2],
		});
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < str.length) {
		tokens.push({ type: "text", value: str.slice(lastIndex) });
	}
	return tokens;
}

function emitAnsi (tokens, mode) {
	let output = "";
	let activeModifiers = new Set();
	let colorStack = [];
	let bgStack = [];

	let emitColor =
		mode === "truecolor" ? ansiTruecolor : mode === "256" ? ansi256 : () => "";

	let replay = () => {
		output += modifiers.reset.ansi;
		for (let modifier of activeModifiers) {
			output += modifiers[modifier].ansi;
		}
		let color = colorStack.findLast(Boolean);
		if (color) {
			output += emitColor(color);
		}
		let bg = bgStack.findLast(Boolean);
		if (bg) {
			output += emitColor(bg, { bg: true });
		}
	};

	for (let token of tokens) {
		if (token.type === "text") {
			output += token.value;
			continue;
		}

		let isBg = token.tag === "bg";
		let isColor = token.tag === "c" || isBg;
		let stack = isBg ? bgStack : colorStack;

		if (token.type === "open") {
			if (isColor) {
				let hex = resolveColor(token.value);
				// Push even when null so close's pop stays balanced.
				stack.push(hex);
				if (hex) {
					output += emitColor(hex, { bg: isBg });
				}
			}
			else {
				activeModifiers.add(token.tag);
				output += modifiers[token.tag].ansi;
			}
		}
		else {
			if (isColor) {
				stack.pop();
			}
			else {
				activeModifiers.delete(token.tag);
			}
			// ANSI has no "close this color" code, so reset and replay remaining state.
			replay();
		}
	}
	return output;
}

function emitCss (tokens) {
	let text = "";
	let styles = [];
	let activeModifiers = new Set();
	let colorStack = [];
	let bgStack = [];

	let pushStyle = () => {
		let parts = [];
		for (let modifier of activeModifiers) {
			parts.push(modifiers[modifier].css);
		}
		let color = colorStack.findLast(Boolean);
		if (color) {
			parts.push(`color: ${color}`);
		}
		let bg = bgStack.findLast(Boolean);
		if (bg) {
			parts.push(`background: ${bg}`);
		}
		text += "%c";
		styles.push(parts.join("; "));
	};

	for (let token of tokens) {
		if (token.type === "text") {
			text += token.value;
			continue;
		}

		let isBg = token.tag === "bg";
		let isColor = token.tag === "c" || isBg;
		let isOpen = token.type === "open";

		if (isColor) {
			let stack = isBg ? bgStack : colorStack;
			if (isOpen) {
				stack.push(resolveColor(token.value));
			}
			else {
				stack.pop();
			}
		}
		else if (isOpen) {
			activeModifiers.add(token.tag);
		}
		else {
			activeModifiers.delete(token.tag);
		}
		pushStyle();
	}

	return [text, ...styles];
}

/**
 * Format a tagged string for the target mode.
 * @param {string} str
 * @param {"truecolor" | "256" | "strip" | "css"} [mode]
 * @returns {string | [string, ...string[]]}
 */
export default function format (str, mode = detectedMode) {
	let tokens = tokenize(String(str ?? ""));
	return mode === "css" ? emitCss(tokens) : emitAnsi(tokens, mode);
}

export function stripFormatting (str) {
	return String(str).replace(tagRegex, "");
}
