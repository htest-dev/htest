import * as check from "../check.js";
import { stringify, defineLazyProperty } from "../util.js";

const INHERITED_PROPS = [
	"beforeEach",
	"run",
	"afterEach",
	"map",
	"check",
	"getName",
	"getData",
	"args",
	"expect",
	"getExpect",
	"throws",
	"maxTime",
	"maxTimeAsync",
	"skip",
	"file",
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

		// expect is getter-only — function shorthand is NOT converted because
		// expect can legitimately be a function value
		let converted = new Set();
		for (let prop of ["name", "data", "expect"]) {
			let accessor =
				Object.getOwnPropertyDescriptor(this, prop)?.get ??
				(prop !== "expect" && typeof this[prop] === "function" && this[prop]);
			if (accessor) {
				let key = "get" + prop[0].toUpperCase() + prop.slice(1);
				this[key] = accessor;
				delete this[prop];
				converted.add(prop);
			}
		}

		// Inherit properties from parent
		// This works recursively because the parent constructor runs before its children
		if (this.parent) {
			for (let prop of INHERITED_PROPS) {
				// converted guard: get expect() → getExpect deletes expect; without it the parent's value would be inherited back
				if (!(prop in this) && prop in this.parent && !converted.has(prop)) {
					Object.defineProperty(
						this,
						prop,
						Object.getOwnPropertyDescriptor(this.parent, prop),
					);
				}
			}
		}

		// Lazy args (arg takes precedence over inherited args)
		if ("arg" in this) {
			let getter = Object.getOwnPropertyDescriptor(this, "arg")?.get;
			if (getter) {
				defineLazyProperty(this, "args", function () {
					try {
						return [getter.call(this)];
					}
					catch {
						return [];
					}
				});
			}
			else {
				// Single argument
				this.args = [this.arg];
			}
		}
		else if ("args" in this) {
			let getter = Object.getOwnPropertyDescriptor(this, "args")?.get;
			if (getter) {
				defineLazyProperty(this, "args", function () {
					try {
						let args = getter.call(this);
						return Array.isArray(args) ? args : [args];
					}
					catch {
						return [];
					}
				});
			}
			// Single args don't need to be wrapped in an array
			else if (!Array.isArray(this.args)) {
				this.args = [this.args];
			}
		}
		else {
			// No args
			this.args = [];
		}

		if (!("check" in this)) {
			this.check = check.equals;
		}
		else {
			let getter = Object.getOwnPropertyDescriptor(this, "check")?.get;
			if (getter) {
				defineLazyProperty(this, "check", function () {
					let value;
					try {
						value = getter.call(this);
					}
					catch {}

					if (value && typeof value === "object") {
						let { deep = true, ...options } = value;
						let shallow = check.shallowEquals(options);
						return deep ? check.deep(shallow) : shallow;
					}
					// Falsy or non-callable values (e.g. getter threw) fall back to default
					return typeof value === "function" ? value : check.equals;
				});
			}
			else if (typeof this.check === "object") {
				let { deep = true, ...options } = this.check;
				let shallow = check.shallowEquals(options);
				this.check = deep ? check.deep(shallow) : shallow;
			}
			// Falsy or non-callable values (e.g. check: false) fall back to default
			else if (typeof this.check !== "function") {
				this.check = check.equals;
			}
		}

		// Prototype chain deferred — avoids triggering parent getters; data getters already converted to getData above
		let ownData = this.data ?? {};
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
