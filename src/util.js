import * as objects from "./objects.js";

/**
 * Whether we are in Node.js
 */
export const IS_NODEJS = typeof process === "object" && process?.versions?.node;

/**
 * Determine the internal JavaScript [[Class]] of an object.
 * @param {*} value - Value to check
 * @returns {string}
 */
export function getType (value, { preserveCase = false } = {}) {
	let str = Object.prototype.toString.call(value);

	let ret = (str.match(/^\[object\s+(.*?)\]$/)[1] || "");

	if (!preserveCase) {
		ret = ret.toLowerCase();
	}

	return ret;
}

export function idify (readable) {
	return ((readable || "") + "")
		.replace(/\s+/g, "-") // Convert whitespace to hyphens
		.replace(/[^\w-]/g, "") // Remove weird characters
		.toLowerCase();
}

export function delay (ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function toPrecision (number, significantDigits) {
	let n = getType(number) === "number" ? number : parseFloat(number);

	if (Number.isNaN(n)) {
		// 🤷🏽‍♀️
		return number;
	}

	let abs = Math.abs(n);


	if (abs < 1) {
		return n.toPrecision(significantDigits);
	}

	let f10 = 10 ** significantDigits;
	if (abs < f10) {
		return Math.round(n * f10) / f10;
	}

	return Math.round(n);
}

let durations = [
	{ unit: "ms", from: 0 },
	{ unit: "s", from: 1000 },
	{ unit: "m", from: 60 },
	{ unit: "h", from: 60 },
	{ unit: "d", from: 24 },
	{ unit: "w", from: 7 },
	{ unit: "y", from: 52 },
];

export function formatDuration (ms) {
	if (!ms) {
		return "0 ms";
	}

	let unit = "ms";
	let n = ms;

	for (let i = 0; i < durations.length; i++) {
		let next = durations[i + 1];

		if (next && n >= next.from) {
			n /= next.from;
			unit = next.unit;
		}
		else {
			if (n < 10) {
				n = toPrecision(+n, 1);
			}
			else {
				n = Math.round(n);
			}

			break;
		}
	}

	return n + " " + unit;
}

/**
 * Escape a string so it can be used literally in regular expressions
 * @param {string} str
 * @returns {string}
 */
export function regexEscape (str) {
	return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

/**
 * Stringify object in a useful way
 */
export const stringifyFlavors = {
	console: (obj, level) => {
		switch (typeof obj) {
			case "symbol":
				return `Symbol(${obj.description})`;
			case "function":
				return obj.toString();
		}

		let type = getType(obj, { preserveCase: true });

		if (!(typeof obj === "object") || !obj || Array.isArray(obj)) {
			return;
		}

		let indent = "\t".repeat(level);

		if (obj?.[Symbol.iterator] && !["String", "Array"].includes(type)) {
			return `${type}(${ obj.length ?? obj.size }) ` + objects.join(obj, ", ", {
				indent,
				map: o => stringify(o),
			 });
		}
		else if (globalThis.HTMLElement && obj instanceof HTMLElement) {
			return obj.outerHTML;
		}

		let toString = obj + "";

		if (!/\[object \w+/.test(toString)) {
			// Has reasonable toString method, return that
			return toString;
		}
	},
};
export function stringify (obj, options = {}) {
	let overrides = options.custom ? [].concat(options.custom) : [];

	overrides.push(stringifyFlavors.console);

	return objects.stringify(obj, {
		custom: overrides,
	});
}

export function subsetTests (test, path) {
	if (!Array.isArray(path)) {
		path = path.split("/");
	}

	let tests = test;

	for (let segment of path) {
		if (tests?.tests) {
			tests = tests.tests;
		}
		else if (!Array.isArray(tests)) {
			tests = null;
		}

		if (!tests) {
			break;
		}

		segment = Number(segment);
		let segmentIndex = (segment < 0 ? tests.length : 0) + segment;

		for (let i = 0; i < tests.length; i++) {
			let t = tests[i];
			if (i !== segmentIndex) {
				t.skip = true;
			}
		}

		tests = tests[segment];
	}

	return tests;
}

// Used in `interceptConsole()` to maintain isolated contexts for each function call.
let asyncLocalStorage;
if (IS_NODEJS) {
	const { AsyncLocalStorage } = await import("node:async_hooks");
	asyncLocalStorage = new AsyncLocalStorage();
}

/**
 * Intercept console output while running a function.
 * @param {Function} fn Function to run.
 * @returns {Promise<Array<{args: Array<string>, method: string}>>} A promise that resolves with an array of intercepted messages containing the used console method and passed arguments.
 */
export async function interceptConsole (fn) {
	if (!IS_NODEJS) {
		await fn();
		return [];
	}

	let messages = [];

	// We don't want to mix up the console messages intercepted during the function's parallel calls,
	// so we use `AsyncLocalStorage` to maintain isolated contexts for each function call.
	return asyncLocalStorage.run(messages, async () => {
		for (let method of ["log", "warn", "error"]) {
			if (console[method].original) {
				continue;
			}

			let original = console[method];
			console[method] = (...args) => {
				let context = asyncLocalStorage.getStore();
				if (context) {
					// context === messages
					context.push({ args, method });
				}
				else {
					original(...args);
				}
			};
			console[method].original = original;
		}

		await fn();
		return messages;
	});
}

/**
 * Pluralize a word.
 * @param {number} n Number to check.
 * @param {string} singular Singular form of the word.
 * @param {string} plural Plural form of the word.
 * @returns {string}
 */
export function pluralize (n, singular, plural) {
	return n === 1 ? singular : plural;
}

