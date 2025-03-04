/**
 * @packageDocumentation
 * This is hTest’s assertion library (but you can use any other)
 * Most functions generate assertion functions based on the parameters you specify.
 */
import { getType } from "./util.js";

/**
 * Combine multiple checks, requiring a test to pass all of them to pass
 * @param  {...function} fns
 * @returns {function}
 */
export function and (...fns) {
	return function (...args) {
		return fns.every(fn => fn(...args));
	};
}

/**
 * Combine multiple checks, requiring a test to pass any of them to pass
 * @param  {...function} fns
 * @returns {function}
 */
export function or (...fns) {
	return function (...args) {
		return fns.some(fn => fn(...args));
	};
}

/**
 * Check value type
 * @param {string} type
 * @returns {function}
 */
export function is (type) {
	type = type.toLowerCase();

	return function (actual) {
		return getType(actual) === type;
	};
}

/**
 * Apply a checking function recursively to objects and collections
 * @param {function} [check] Function to apply to compare primitive values. Defaults to strict equality
 * @returns {(actual, expect) => boolean}
 */
export function deep (check = (a, b) => a === b) {
	let callee = function (actual, expect) {
		if (check.call(this, actual, expect)) {
			return true;
		}

		if (typeof expect !== "object") {
			// If not an object, it's definitely not a container object,
			// and we know it doesn't pass, so we can fail early.
			return false;
		}

		if (Array.isArray(expect)) {
			if (!Array.isArray(actual) || actual.length < expect.length) {
				return false;
			}

			return expect.every((ref, i) => callee.call(this, actual[i], ref));
		}

		let type = getType(expect);
		let actualtype = getType(actual);

		if (expect?.[Symbol.iterator]) {
			// Iterable collection (Array, Set, Map, NodeList, etc.)
			if (actualtype !== type) {
				return false;
			}

			return callee.call(this, [...actual], [...expect]);
		}

		// Compare objects recursively
		if (type === "object") {
			if (actualtype !== type) {
				return false;
			}

			let propertyUnion = new Set([...Object.keys(expect), ...Object.keys(actual)]);
			return [...propertyUnion].every(key => callee(actual[key], expect[key]));
		}

		return false;
	};

	callee.shallow = check;

	return callee;
}

/**
 * Shallow equals function at the core of many other comparison functions
 * @param {object} options
 * @param {boolean} [options.looseTypes = false] If true, skip type check (e.g. "5" can match 5)
 * @param {boolean} [options.subset = false] If true, `undefined` is considered equal to anything
 * @param {number} [options.epsilon = 0] Epsilon for number comparison
 * @returns {(actual, expect) => boolean}
 */
export function shallowEquals ({
	looseTypes = false,
	subset = false,
	epsilon = 0,
} = {}) {
	return function (actual, expect) {
		if (expect === actual) {
			return true;
		}

		if (expect === null) {
			return actual === null;
		}

		if (expect === undefined && subset) {
			return true;
		}

		let expectType = getType(expect);
		let actualType = getType(actual);

		if (expectType === actualType || looseTypes) {
			if (expectType === "number") {
				if (Number.isNaN(expect)) {
					return Number.isNaN(actual);
				}

				if (epsilon > 0) {
					return Math.abs(expect - actual) <= epsilon;
				}
			}

			return expect == actual;
		}

		return false;
	};
}

/**
 * Compare by equality. Slightly more permissive than `===`.
 * Deep by default, use `equals.shallow` for shallow comparison.
 * @param {*} expect
 * @param {*} actual
 * @returns {boolean}
 */
export const equals = deep(shallowEquals());

/**
 * Compare by specifying subsets of properties to compare
 * @param {*} expect
 * @param {*} actual
 * @returns {boolean}
 */
export const subset = deep(shallowEquals({subset: true}));

/**
 * Compare numbers or lists of numbers with a margin of error
 * @param {object} [options] Options object
 * @param {number} [options.epsilon = Number.EPSILON] Epsilon for comparison
 * @returns {(actual, expect) => boolean}
 */
export function proximity ({epsilon = Number.EPSILON, ...options} = {}) {
	return shallowEquals({epsilon, ...options});
}

/**
 * Check that numbers (or lists of numbers) are within certain upper and/or lower bounds
 * @param {object} [options]
 * @param {number} options.gt
 * @param {number} options.gte
 * @param {number} options.lt
 * @param {number} options.lte
 * @param {number} options.from Alias of `options.lt`
 * @param {number} options.max Alias of `options.lte`
 * @param {number} options.to Alias of `options.gt`
 * @param {number} options.min Alias of `options.gte`
 * @returns {(actual, expect) => boolean}
 */
export function range (options = {}) {
	options.lt ??= options.from;
	options.lte ??= options.min;
	options.gt ??= options.to;
	options.gte ??= options.max;

	return function (actual) {
		return (
			(options.lt  === undefined || actual <  options.lt)  &&
			(options.lte === undefined || actual <= options.lte) &&
			(options.gt  === undefined || actual >  options.gt)  &&
			(options.gte === undefined || actual >= options.gte)
		);
	};
}

/**
 * Alias of `range()`
 */
export const between = range;
