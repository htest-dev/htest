import * as check from "../check.js";
import { stringify } from "../util.js";

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
];

// `name` and `data` are not inherited as values, but accessor descriptors are.
const ACCESSOR_INHERITED_PROPS = ["name", "data"];

/**
 * Define a one-shot lazy property: the getter runs at most once per instance,
 * then the result replaces it as a writable data property.
 */
function defineLazy (target, prop, compute) {
	Object.defineProperty(target, prop, {
		configurable: true,
		enumerable: true,
		get () {
			let value = compute.call(this);
			Object.defineProperty(this, prop, {
				value,
				writable: true,
				configurable: true,
				enumerable: true,
			});
			return value;
		},
	});
}

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

		// Copy properties from the test definition, preserving accessor descriptors.
		Object.defineProperties(this, Object.getOwnPropertyDescriptors(test));

		// Function shorthand: `name () {...}` / `data () {...}` become accessors.
		for (let prop of ["name", "data"]) {
			let desc = Object.getOwnPropertyDescriptor(this, prop);
			if (desc && "value" in desc && typeof desc.value === "function") {
				let fn = desc.value;
				Object.defineProperty(this, prop, {
					configurable: true,
					enumerable: true,
					get () {
						return fn.apply(this, this.args);
					},
				});
			}
		}

		// Wrap own user-defined accessors with safe-fallback + caching wrappers.
		// Done before inheritance so children that inherit these descriptors get the
		// already-wrapped version (no double-wrap on each level).
		let nameDesc = Object.getOwnPropertyDescriptor(this, "name");
		if (nameDesc?.get) {
			let userGetter = nameDesc.get;
			defineLazy(this, "name", function () {
				let value;
				try {
					value = userGetter.call(this);
				}
				catch {}

				if (!value && this.isTest) {
					value = this.args.length > 0 ? stringify(this.args[0]) : "(No args)";
				}

				return value;
			});
		}

		let dataDesc = Object.getOwnPropertyDescriptor(this, "data");
		if (dataDesc?.get) {
			let userGetter = dataDesc.get;
			defineLazy(this, "data", function () {
				let value;
				try {
					value = userGetter.call(this);
				}
				catch {
					value = {};
				}
				return Object.create(
					this.parent?.data ?? null,
					Object.getOwnPropertyDescriptors(value ?? {}),
				);
			});
		}

		let expectDesc = Object.getOwnPropertyDescriptor(this, "expect");
		if (expectDesc?.get) {
			let userGetter = expectDesc.get;
			defineLazy(this, "expect", function () {
				try {
					return userGetter.call(this);
				}
				catch {
					return this.args[0];
				}
			});
		}

		// Inherit properties from parent (preserving descriptors, including accessors).
		// This works recursively because the parent constructor runs before its children.
		if (this.parent) {
			for (let prop of INHERITED_PROPS) {
				if (!Object.prototype.hasOwnProperty.call(this, prop)) {
					let desc = Object.getOwnPropertyDescriptor(this.parent, prop);
					if (desc) {
						Object.defineProperty(this, prop, desc);
					}
				}
			}

			// `name` and `data`: only inherit accessor descriptors (not values).
			for (let prop of ACCESSOR_INHERITED_PROPS) {
				if (!Object.prototype.hasOwnProperty.call(this, prop)) {
					let desc = Object.getOwnPropertyDescriptor(this.parent, prop);
					if (desc?.get) {
						Object.defineProperty(this, prop, desc);
					}
				}
			}
		}

		if (!this.check) {
			this.check = check.equals;
		}
		else if (typeof this.check === "object") {
			let { deep, ...options } = this.check;
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

		// Wire `data`. If `data` is an accessor (own or inherited), the wrapper handles wiring.
		// Otherwise: literal data is wired via Object.create. If `getData` is defined and no
		// literal data was provided, fall back to the legacy eager getData call.
		dataDesc = Object.getOwnPropertyDescriptor(this, "data");
		if (!dataDesc?.get) {
			let own = dataDesc && "value" in dataDesc ? dataDesc.value : {};
			this.data = Object.create(
				this.parent?.data ?? null,
				Object.getOwnPropertyDescriptors(own ?? {}),
			);

			if (this.getData && Object.keys(this.data).length === 0) {
				try {
					let data = this.getData.apply(this, this.args);
					Object.defineProperties(this.data, Object.getOwnPropertyDescriptors(data));
				}
				catch {}
			}
		}

		if (this.isGroup) {
			this.tests = this.tests
				.filter(Boolean)
				.map(t => (t instanceof Test ? t : new Test(t, this)));
		}

		// Default name for leaf tests with no `name` defined.
		// Falls back to `getName()` (legacy) if defined.
		nameDesc = Object.getOwnPropertyDescriptor(this, "name");
		if (!nameDesc) {
			if (this.getName) {
				try {
					this.name = this.getName.apply(this, this.args);
				}
				catch {}
			}

			if (!this.name && this.isTest) {
				this.name = this.args.length > 0 ? stringify(this.args[0]) : "(No args)";
			}
		}

		// Default `expect`. Falls back to `getExpect()` (legacy) if defined, then to `args[0]`.
		expectDesc = Object.getOwnPropertyDescriptor(this, "expect");
		if (!expectDesc) {
			if (this.getExpect) {
				try {
					this.expect = this.getExpect.apply(this, this.args);
				}
				catch {}
			}

			if (!Object.getOwnPropertyDescriptor(this, "expect")) {
				this.expect = this.args[0];
			}
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
