import { stringify } from "../src/util.js";

export default {
	run: stringify,
	tests: [
		{ arg: undefined, expect: "undefined" },
		{ arg: null, expect: "null" },
		{ arg: 1, expect: "1" },
		{ arg: NaN, expect: "NaN" },
		{ arg: "foo", expect: '"foo"' },
		{ arg: [1, 2, 3], expect: "[1, 2, 3]" },
		{ arg: { foo: "bar" }, expect: '{"foo": "bar"}' },
		{ arg: new Set([1, 2, 3]), expect: "Set(3) {1, 2, 3}" },
	],
};
