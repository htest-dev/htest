/**
 * Format console text with HTML-like tags.
 *
 * Two backends:
 *   - ANSI (default on Node): truecolor / 256 / strip
 *   - CSS (default on browser): returns [text, ...styles] for console.log spread
 */

import { IS_NODEJS } from "../util.js";
import palette from "./palette.js";

const modifiers = {
	b: { ansi: "\x1b[1m", css: "font-weight: bold" },
	i: { ansi: "\x1b[3m", css: "font-style: italic" },
	dim: { ansi: "\x1b[2m", css: "opacity: 0.6" },
};

// Matches opening/closing tags. Color value allows letters, digits, dash, hash.
const tagRegex = /<\/?(b|i|dim|c|bg)(?:\s+([\w#-]+))?\s*>/gi;

/**
 * Detects the appropriate ANSI mode from an env-like object.
 * Pure function — takes env as argument for testability.
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {"truecolor" | "256" | "strip"}
 */
function detectMode (env = process?.env ?? {}) {
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

const detectedMode = IS_NODEJS ? detectMode() : "truecolor";

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

// 256-color cube levels
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
	let foregroundStack = [];
	let backgroundStack = [];

	let emitColor =
		mode === "truecolor" ? ansiTruecolor : mode === "256" ? ansi256 : () => "";

	let replay = () => {
		output += "\x1b[0m";
		for (let modifier of activeModifiers) {
			output += modifiers[modifier].ansi;
		}
		let foreground = foregroundStack.findLast(hex => hex);
		if (foreground) {
			output += emitColor(foreground);
		}
		let background = backgroundStack.findLast(hex => hex);
		if (background) {
			output += emitColor(background, { bg: true });
		}
	};

	for (let token of tokens) {
		if (token.type === "text") {
			output += token.value;
			continue;
		}
		if (token.type === "open") {
			if (token.tag === "c") {
				let hex = resolveColor(token.value);
				foregroundStack.push(hex);
				if (hex) {
					output += emitColor(hex);
				}
			}
			else if (token.tag === "bg") {
				let hex = resolveColor(token.value);
				backgroundStack.push(hex);
				if (hex) {
					output += emitColor(hex, { bg: true });
				}
			}
			else if (modifiers[token.tag]) {
				activeModifiers.add(token.tag);
				output += modifiers[token.tag].ansi;
			}
		}
		else {
			if (token.tag === "c") {
				foregroundStack.pop();
			}
			else if (token.tag === "bg") {
				backgroundStack.pop();
			}
			else {
				activeModifiers.delete(token.tag);
			}
			replay();
		}
	}
	return output;
}

function emitCss (tokens) {
	let text = "";
	let styles = [];
	let activeModifiers = new Set();
	let foregroundStack = [];
	let backgroundStack = [];

	let pushStyle = () => {
		let parts = [];
		for (let modifier of activeModifiers) {
			parts.push(modifiers[modifier].css);
		}
		let foreground = foregroundStack.findLast(hex => hex);
		if (foreground) {
			parts.push(`color: ${foreground}`);
		}
		let background = backgroundStack.findLast(hex => hex);
		if (background) {
			parts.push(`background: ${background}`);
		}
		text += "%c";
		styles.push(parts.join("; "));
	};

	for (let token of tokens) {
		if (token.type === "text") {
			text += token.value;
			continue;
		}
		if (token.type === "open") {
			if (token.tag === "c") {
				let hex = resolveColor(token.value);
				foregroundStack.push(hex);
				pushStyle();
			}
			else if (token.tag === "bg") {
				let hex = resolveColor(token.value);
				backgroundStack.push(hex);
				pushStyle();
			}
			else if (modifiers[token.tag]) {
				activeModifiers.add(token.tag);
				pushStyle();
			}
		}
		else {
			if (token.tag === "c") {
				foregroundStack.pop();
			}
			else if (token.tag === "bg") {
				backgroundStack.pop();
			}
			else {
				activeModifiers.delete(token.tag);
			}
			pushStyle();
		}
	}

	return [text, ...styles];
}

/**
 * Format a tagged string for the target backend.
 * @param {string} str
 * @param {{ css?: boolean, mode?: "truecolor" | "256" | "strip" }} [options]
 * @returns {string | [string, ...string[]]}
 */
export default function format (
	str,
	{ css = !IS_NODEJS, mode = detectedMode } = {},
) {
	if (!str) {
		return css ? ["", ""] : str;
	}
	let tokens = tokenize(String(str));
	return css ? emitCss(tokens) : emitAnsi(tokens, mode);
}

export function stripFormatting (str) {
	return String(str).replace(tagRegex, "");
}
