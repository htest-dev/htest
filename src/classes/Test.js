import * as check from "../check.js";
import { stringify, defineLazyProperty } from "../util.js";

const INHERITED_PROPS = [
	"beforeEach",
	"run",
	"afterEach",
	"map",
	"check",
	"args",
	"expect",
	"throws",
	"maxTime",
	"maxTimeAsync",
	"skip",
	"file",
];

// Properties whose value can be a function — function shorthand not converted to getXXX
const NO_SHORTHAND = [
	"arg",
	"expect",
	"run",
	"beforeEach",
	"afterEach",
	"beforeAll",
	"afterAll",
	"check",
	"map",
	"throws",
];

/**
 * Represents a single test or a group of tests
 */
export default class Test {
	constructor (test, parent) {
		if (!test) {
			console.warn("Empty test: ", test);
			return;
		}

		if (parent) {
			test.parent = parent;
			this.level = parent.level + 1;
		}
		else {
			this.level = 0;
		}

		// Copy descriptors so that accessors are preserved (and only invoked when actually accessed).
		// Normalize each descriptor to be configurable, enumerable, and assignable/writable
		let descriptors = Object.getOwnPropertyDescriptors(test);
		for (let key of Object.keys(descriptors)) {
			let descriptor = descriptors[key];
			descriptor.configurable = true;
			descriptor.enumerable = true;

			if ("value" in descriptor) {
				descriptor.writable = true;
			}
			else if (!descriptor.set) {
				descriptor.set = function (value) {
					Object.defineProperty(this, key, {
						value,
						writable: true,
						enumerable: true,
						configurable: true,
					});
				};
			}
		}
		Object.defineProperties(this, descriptors);

		// Convert getters and function shorthands to getXXX
		// Getters are always converted; function shorthands only for non-function-valued props
		let converted = new Set();
		for (let key of Object.keys(descriptors)) {
			// getXXX are already getter functions (legacy API or from parent conversion)
			if (/^get[A-Z]/.test(key)) {
				continue;
			}

			let accessor =
				Object.getOwnPropertyDescriptor(this, key)?.get ??
				(!NO_SHORTHAND.includes(key) && typeof this[key] === "function" && this[key]);
			if (accessor) {
				let prop = "get" + key[0].toUpperCase() + key.slice(1);
				this[prop] = accessor;
				delete this[key];
				converted.add(key);
			}
		}

		// Inherit properties from parent
		// This works recursively because the parent constructor runs before its children
		if (this.parent) {
			for (let prop of INHERITED_PROPS) {
				// Conversion deletes the original prop; without this guard
				// the parent's value would be inherited back over the child's getter
				if (!(prop in this) && prop in this.parent && !converted.has(prop)) {
					Object.defineProperty(
						this,
						prop,
						Object.getOwnPropertyDescriptor(this.parent, prop),
					);
				}
			}

			// Inherit getXXX properties (from getter/shorthand conversion)
			for (let key of Object.keys(this.parent)) {
				if (/^get[A-Z]/.test(key) && !(key in this)) {
					Object.defineProperty(
						this,
						key,
						Object.getOwnPropertyDescriptor(this.parent, key),
					);
				}
			}
		}

		// Lazy args (arg takes precedence over inherited args)
		if (this.getArg) {
			converted.delete("arg");
			defineLazyProperty(this, "args", function () {
				return [this.getArg()];
			});
		}
		else if ("arg" in this) {
			// Single argument
			this.args = [this.arg];
		}
		else if (this.getArgs) {
			converted.delete("args");
			defineLazyProperty(this, "args", function () {
				let args = this.getArgs();
				return Array.isArray(args) ? args : [args];
			});
		}
		else if ("args" in this) {
			// Single args don't need to be wrapped in an array
			if (!Array.isArray(this.args)) {
				this.args = [this.args];
			}
		}
		else {
			// No args
			this.args = [];
		}

		if (this.getCheck) {
			converted.delete("check");
			defineLazyProperty(this, "check", function () {
				let value;
				try {
					value = this.getCheck();
				}
				catch {}

				if (value && typeof value === "object") {
					let { deep = true, ...options } = value;
					let shallowEquals = check.shallowEquals(options);
					return deep ? check.deep(shallowEquals) : shallowEquals;
				}
				// Falsy or non-callable values (e.g. getter threw) fall back to default
				return typeof value === "function" ? value : check.equals;
			});
		}
		else if (!("check" in this)) {
			this.check = check.equals;
		}
		else if (typeof this.check === "object") {
			let { deep = true, ...options } = this.check;
			let shallowEquals = check.shallowEquals(options);
			this.check = deep ? check.deep(shallowEquals) : shallowEquals;
		}
		// Falsy or non-callable values (e.g. check: false) fall back to default
		else if (typeof this.check !== "function") {
			this.check = check.equals;
		}

		// Prototype chain deferred — avoids triggering parent getters; data getters already converted to getData above
		let ownData = this.data ?? {};
		converted.delete("data");
		defineLazyProperty(this, "data", function () {
			let data = Object.create(
				this.parent?.data ?? null,
				Object.getOwnPropertyDescriptors(ownData),
			);

			if (this.getData && Object.keys(data).length === 0) {
				try {
					let computed = this.getData.apply(this, this.args);
					Object.defineProperties(data, Object.getOwnPropertyDescriptors(computed));
				}
				catch {}
			}

			return data;
		});

		// Generic lazy resolution for converted properties without custom resolvers
		// name/expect are handled below (they have fallback logic)
		converted.delete("name");
		converted.delete("expect");
		for (let prop of converted) {
			let key = "get" + prop[0].toUpperCase() + prop.slice(1);
			defineLazyProperty(this, prop, function () {
				return this[key].apply(this, this.args);
			});
		}

		if (this.isGroup) {
			this.tests = this.tests
				.filter(Boolean)
				.map(t => (t instanceof Test ? t : new Test(t, this)));
		}

		if (!this.name && (this.getName || this.isTest)) {
			defineLazyProperty(this, "name", function () {
				let name;
				try {
					name = this.getName?.apply(this, this.args);
				}
				catch {}

				if (!name && this.isTest) {
					name = this.args.length > 0 ? stringify(this.args[0]) : "(No args)";
				}

				return name;
			});
		}

		if (!("expect" in this)) {
			defineLazyProperty(this, "expect", function () {
				if (this.getExpect) {
					try {
						return this.getExpect.apply(this, this.args);
					}
					catch {}
				}
				return this.args[0];
			});
		}
	}

	get isTest () {
		return !this.isGroup;
	}

	get isGroup () {
		return this.tests?.length > 0;
	}

	get testCount () {
		let count = this.isTest ? 1 : 0;

		if (this.tests) {
			count += this.tests.reduce((prev, current) => prev + current.testCount, 0);
		}

		return count;
	}

	warn (msg) {
		let message = `[${this.name}] ${msg}`;
		(this.warnings ??= []).push(message);

		if (this.constructor.warn) {
			this.constructor.warn(message);
		}
	}

	static warn (...args) {
		console.warn("[hTest test]", ...args);
	}
}
