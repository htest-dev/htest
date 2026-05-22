import { getType, regexEscape } from "./util.js";

export function extract (patterns) {
	// Convert patterns to one big regex
	let flags = new Set("g");
	patterns = Array.isArray(patterns) ? patterns : [patterns];
	let regex = patterns
		.map(pattern => {
			if (getType(pattern) === "string") {
				return regexEscape(pattern);
			}
			else if (getType(pattern) === "regexp") {
				// Merge flags
				pattern.flags.split("").forEach(flag => flags.add(flag));
				return pattern.source;
			}
		})
		.join("|");

	regex = RegExp(regex, [...flags].join(""));

	let callee = function (value) {
		if (Array.isArray(value)) {
			return value.map(n => callee(n));
		}

		let type = getType(value);
		value = value + "";
		return (value + "").match(regex) ?? [];
	};

	return callee;
}

/**
 * Extract lists of numbers from a value
 * @param {*} value
 *
 * @returns
 */
let rNumber = /-?\d*\.?\d+(?:e-?\d+)?/g;
export function extractNumbers (value) {
	let type = getType(value);

	if (type === "number") {
		return [value];
	}
	else {
		let patterns = [rNumber, "NaN", "null", "Infinity", "-Infinity"];

		let f = extract(patterns);
		return f(value).map(n => (!Number.isNaN(n) ? parseFloat(n) : n));
	}
}

export function trimmed (value) {
	return (value + "").trim();
}
