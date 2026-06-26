import Test from "../src/classes/Test.js";

export default {
	name: "Getters",
	tests: [
		{
			name: "getName()",
			run () {
				return this.name;
			},
			tests: [
				{
					name: "Called with test args",
					getName (x) {
						return "Test " + x;
					},
					tests: [{ arg: "foo", expect: "Test foo" }],
				},
				{
					name: "Explicit name wins over getName",
					getName () {
						return "generated";
					},
					tests: [{ name: "explicit", expect: "explicit" }],
				},
				{
					name: "Failure falls through to default name (args[0])",
					getName () {
						throw new Error();
					},
					tests: [{ arg: 42, expect: "42" }],
				},
				{
					name: "Failure on group with no run() does not crash children (issue #119)",
					run () {
						let t = new Test({
							getName () {
								return this.run.name + "()";
							},
							tests: [
								{
									run: function foo () {
										return 42;
									},
									arg: "foo",
									expect: 42,
								},
							],
						});
						return t.tests[0].name;
					},
					expect: "foo()",
				},
			],
		},
		{
			name: "getExpect()",
			tests: [
				{
					name: "Called with test args",
					getExpect (x) {
						return x * 2;
					},
					run (x) {
						return x * 2;
					},
					tests: [{ arg: 5 }],
				},
				{
					name: "Explicit expect wins over getExpect",
					getExpect () {
						return "generated";
					},
					run () {
						return "explicit";
					},
					tests: [{ arg: "foo", expect: "explicit" }],
				},
				{
					name: "Failure falls through to default expect (args[0])",
					getExpect () {
						throw new Error();
					},
					tests: [{ args: ["foo", "bar"], expect: "foo" }],
				},
			],
		},
	],
};
