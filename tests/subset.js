import { subsetTests } from "../src/util.js";

const getTestNames = test => (test.skip ? [] : (test.tests?.flatMap(getTestNames) ?? [test.name]));

export default {
	name: "subsetTests",
	getData () {
		return {
			test: {
				tests: [
					{ name: "alpha", tests: [{ name: "one" }, { name: "two" }] },
					{ name: "beta", tests: [{ name: "found", id: "needle" }, { name: "other" }] },
					{ name: "gamma", tests: [{ name: "edge", id: "42-handler" }] },
				],
			},
		};
	},
	run (path) {
		let { test } = this.data;
		subsetTests(test, path);
		return getTestNames(test);
	},
	tests: [
		{ name: "String path", arg: "1/0", expect: ["found"] },
		{ name: "Array path", arg: ["1", "0"], expect: ["found"] },
		{ name: "Array element splits on slash", arg: ["1/0"], expect: ["found"] },
		{ name: "Id finds descendant", arg: ["needle"], expect: ["found"] },
		{ name: "Numeric prefix then id", arg: ["1", "needle"], expect: ["found"] },
		{ name: "Partial path", arg: "1", expect: ["found", "other"] },
		{ name: "Negative index counts from the end", arg: -1, expect: ["edge"] },
		{ name: "Negative index inside a group", arg: "1/-1", expect: ["other"] },
		{
			name: "Missing id leaves the tree untouched",
			arg: ["nope"],
			expect: ["one", "two", "found", "other", "edge"],
		},
		{
			name: "Out-of-range index leaves the tree untouched",
			arg: 99,
			expect: ["one", "two", "found", "other", "edge"],
		},
		{
			name: "Negative out-of-range leaves the tree untouched",
			arg: -99,
			expect: ["one", "two", "found", "other", "edge"],
		},
		{
			name: "Id starting with a digit is searched, not parsed",
			arg: ["42-handler"],
			expect: ["edge"],
		},
		{ name: "Empty path segments are tolerated", arg: "/1/0/", expect: ["found"] },
		{
			name: "Empty selector leaves the tree untouched",
			arg: "",
			expect: ["one", "two", "found", "other", "edge"],
		},
	],
};
