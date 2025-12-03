// Object utils
import { getType } from "./util.js";

// TODO there must be a better way to do this than hardcoding them all?
// How can we detect from the object itself?
const dictionaryTypes = ["Map", "FormData", "URLSearchParams", "Headers"];

export function children (obj) {
	switch (obj) {
		case undefined:
		case null:
			return obj;
	}

	switch (typeof obj) {
		case "symbol":
		case "number":
		case "string":
		case "boolean":
		case "function":
			return obj;
	}

	// Only objects from here on out

	let type = getType(obj, { preserveCase: true });

	switch (type) {
		case "String":
		case "Number":
		case "Boolean":
			return obj;
	}

	// Ok, for reals now

	if (obj?.[Symbol.iterator]) {
		// Iterables (Array, Set, Map, NodeList, etc.)
		let isDictionary = dictionaryTypes.includes(type);
		return isDictionary ? new Map(obj) : Array.from(obj);
	}

	if (type === "Object") {
		// Plain objects
		return new Map(Object.entries(obj));
	}

	return obj;
}

/**
 * Walk an object recursively and call a function on each value
 */
export function walk (obj, fn, ο) {
	return walker(obj, fn);
}

function walker (obj, fn, meta = {}) {
	meta.level ??= 0;
	meta.key ??= null;
	meta.parent ??= null;

	let children = children(obj);

	if (children instanceof Map || Array.isArray(children)) {
		// Key-value pairs
		return children.forEach((value, key) => {
			let newMeta = {parent: obj, key, level: meta.level + 1};
			fn(value, key, newMeta.parent);

			walker(value, fn, newMeta);
		});

	}
	else {
		return fn(obj, meta.key, meta.parent);
	}
}

// export function map (obj, fn) {
// 	obj = clone(obj);
// 	walk (obj, (value, key, parent) => {
// 		let newValue = fn(value, key, parent);

// 		if (newValue !== undefined) {
// 			parent[key] = newValue;
// 		}
// 	});

// 	return obj;
// }

export function reduce (obj, fn, initialValue) {
	let ret = initialValue;
	walk(obj, (value, key, parent) => {
		ret = fn(ret, value, key, parent);
	});

	return ret;
}

/**
 * Graceful structured clone algorithm
 * Doesn’t throw if it cannot clone, it just returns the original object
 * @param {*} obj
 * @returns {*}
 */
function clone (obj) {
	switch (obj) {
		case undefined:
		case null:
			return obj;
	}

	switch (typeof obj) {
		case "symbol":
		case "number":
		case "string":
		case "boolean":
		case "function":
			return obj;
	}

	// Only objects from here on out

	let type = getType(obj, { preserveCase: true });
	let ret;

	switch (type) {
		case "String":
		case "Number":
		case "Boolean":
			ret = new globalThis[type](obj);
			// A common reason to use a wrapper object is to add properties to it
			let properties = Object.fromEntries(Object.entries(obj).filter(([key, value]) => !isNaN(key) && key !== "length"));
			Object.assign(ret, properties);
			return ret;
		case "Date":
		case "RegExp":
		case "Set":
		case "Map":
			ret = new globalThis[type](obj);
			// FIXME if these properties are not primitives, they will be shared between the original and the clone
			Object.assign(ret, obj);
			return ret;
		case "Array":
			return obj.map(o => clone(o));
		case "Object":
			return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, clone(value)]));
	}

	if (obj instanceof Node) {
		return obj.cloneNode(true);
	}

	if (obj.clone) {
		return obj.clone();
	}

	return obj;
}

export function join (obj, {
	separator = ",",
	keyValueSeparator = ":",
	open = "{",
	close = "}",
	indent = "\t",
	map = _ => _,
	mapKey = _ => _,
	maxLineLength = 80,
} = {}) {
	let kids = children(obj);

	if (kids instanceof Map || Array.isArray(kids)) {
		let stringKids;
		if (kids instanceof Map) {
			stringKids = Object.entries(obj).map(([key, value]) => `${ mapKey(key) }${keyValueSeparator} ${ map(value) }`);
		}
		else {
			stringKids = kids.map(o => map(o));
		}

		let childrenSingleLine = stringKids.join(separator + " ");
		return childrenSingleLine.length > indent.length + maxLineLength ?
				 [
				`${open}`,
				`${indent}\t${stringKids.join(`,\n${indent}\t`)}`,
				`${indent}${close}`,
				 ].join(`${separator}\n`) :
				 `${open}${ childrenSingleLine }${close}`;
	}
	else {
		// Nothing to join
		return obj;
	}
}

/**
 * Like JSON.stringify but its serialization can be customized
 * and prevents cycles
 * @param {*} obj
 * @param {object} options
 * @param {function | function[]} custom - Override how a certain value is serialized.
 * 	Should return undefined if the value should be serialized normally.
 *  If an array, the first function that returns a non-undefined value is used.
 * @returns {string}
 */
export function stringify (obj, options = {}) {
	let seen = new WeakSet();

	return callee(obj, 0);

	function callee (obj, level) {
		if (typeof obj === "object" && obj !== null) {
			if (seen.has(obj)) {
				return "[Circular]";
			}
			seen.add(obj);
		}

		if (options.custom) {
			let fns = Array.isArray(options.custom) ? options.custom : [options.custom];
			for (let fn of fns) {
				let ret = fn(obj, level);
				if (ret !== undefined) {
					return ret;
				}
			}
		}

		let indent = "\t".repeat(level);

		switch (obj) {
			case undefined:
			case null:
				return obj + "";
		}

		switch (typeof obj) {
			case "symbol":
				return undefined;
			case "number":
				if (Number.isNaN(obj)) {
					return "NaN";
				}
				// pass-through
			case "string":
			case "boolean":
				return JSON.stringify(obj);
		}

		// Only objects from here on out

		if (obj.toJSON) {
			return obj.toJSON();
		}

		let type = getType(obj, { preserveCase: true });
		let ret;

		switch (type) {
			case "String":
			case "Number":
			case "Boolean":
				return ret.valueOf();
			case "Date":
				return ret + "";
			case "RegExp":
			case "Set":
			case "Map":
				return "{}";
			case "Array":
				return join(obj, {
					open: "[", close: "]",
					indent,
					map: o => callee(o, level + 1),
				 });
		}

		return join(obj, {
			open: "{", close: "}",
			indent,
			map: o => callee(o, level + 1),
			mapKey: o => callee(o, level + 1),
		 });
	}
}
