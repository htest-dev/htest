import * as check from "../check.js";
import { stringify } from "../util.js";

/**
 * Represents a single test or a group of tests
 */
export default class Test {
	#parent = null;
	data = {};

	constructor (test, parent) {
		if (!test) {
			console.warn("Empty test: ", test);
			return;
		}

		if (parent) {
			this.#parent = parent;
			this.level = parent.level + 1;
		}
		else {
			this.level = 0;
		}

		Object.assign(this, test);

		this.data = Object.create(this.#parent?.data ?? null, Object.getOwnPropertyDescriptors(this.data));
		this.originalName = this.name;

		if (typeof this.name === "function") {
			this.getName = this.name;
		}

		// Inherit properties from parent
		// This works recursively because the parent constructor runs before its children
		if (this.#parent) {
			for (let prop of ["beforeEach", "run", "afterEach", "map", "check", "getName", "args", "expect", "getExpect", "throws", "maxTime", "maxTimeAsync", "skip"]) {
				if (!(prop in this) && prop in this.#parent) {
					this[prop] = this.#parent[prop];
				}
			}
		}

		if (!this.check) {
			this.check = check.equals;
		}
		else if (typeof this.check === "object") {
			let {deep, ...options} = this.check;
			let shallowEquals = check.shallowEquals(options);
			this.check = deep ? check.deep(shallowEquals) : shallowEquals;
		}

		if ("arg" in this) {
			// Single argument
			this.args = [this.arg];
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

		if (!this.name) {
			if (this.getName) {
				this.name = this.getName.apply(this, this.args);
			}
			else if (this.isTest) {
				this.name = this.args.length > 0 ? stringify(this.args[0]) : "(No args)";
			}
		}

		if (this.isGroup) {
			this.tests = this.tests.filter(Boolean).map(t => t instanceof Test ? t : new Test(t, this));
		}

		if (!("expect" in this)) {
			if (this.getExpect) {
				this.expect = this.getExpect.apply(this, this.args);
			}
			else {
				this.expect = this.args[0];
			}
		}
	}

	// Proxy so this.parent.foo() inside an inherited function resolves to
	// the nearest ancestor with a different foo, not the same inherited one.
	get parent () {
		let self = this;
		let target = this.#parent;

		if (!target) {
			return null;
		}

		return new Proxy(target, {
			get (/** @type {Test} */ test, prop) {
				let value = test[prop];

				if (typeof prop === "symbol" || typeof value !== "function") {
					return value;
				}

				if (self[prop] === value) {
					/** @type {Test} */
					let ancestor = test.#parent;

					while (ancestor) {
						let ancestorValue = ancestor[prop];

						if (typeof ancestorValue === "function" && ancestorValue !== value) {
							return function (...args) {
								let originalParent = self.#parent;
								self.#parent = ancestor.#parent;

								try {
									return ancestorValue.call(self, ...args);
								}
								finally {
									self.#parent = originalParent;
								}
							};
						}

						ancestor = ancestor.#parent;
					}
				}

				return value.bind(self);
			},
		});
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
