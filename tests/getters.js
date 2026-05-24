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
					name: "name() function shorthand",
					run () {
						let t = new Test({
							name () {
								return "group " + this.level;
							},
							tests: [{ arg: 42 }],
						});
						return { parent: t.name, child: t.tests[0].name };
					},
					expect: { parent: "group 0", child: "group 1" },
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
		{
			name: "name accessor",
			run () {
				return this.name;
			},
			tests: [
				{
					name: "Called with test args via this.args",
					tests: [
						{
							get name () {
								return "Test " + this.args[0];
							},
							arg: "foo",
							expect: "Test foo",
						},
					],
				},
				{
					name: "Inherited from parent accessor descriptor",
					tests: [
						{
							get name () {
								return "Test " + this.args[0];
							},
							tests: [{ arg: "bar", expect: "Test bar" }],
						},
					],
				},
				{
					name: "Explicit name literal wins over inherited accessor",
					tests: [
						{
							get name () {
								return "generated";
							},
							tests: [{ name: "explicit", expect: "explicit" }],
						},
					],
				},
				{
					name: "Failure falls through to default name (args[0])",
					tests: [
						{
							get name () {
								throw new Error();
							},
							tests: [{ arg: 42, expect: "42" }],
						},
					],
				},
				{
					name: "Accessor wins over getName when both defined",
					tests: [
						{
							get name () {
								return "from accessor";
							},
							getName () {
								return "from getName";
							},
							tests: [{ arg: "x", expect: "from accessor" }],
						},
					],
				},
			],
		},
		{
			name: "expect accessor",
			tests: [
				{
					name: "Called with test args via this.args",
					run (x) {
						return x * 2;
					},
					tests: [
						{
							get expect () {
								return this.args[0] * 2;
							},
							arg: 5,
						},
					],
				},
				{
					name: "Inherited from parent accessor descriptor",
					run (x) {
						return x * 2;
					},
					tests: [
						{
							get expect () {
								return this.args[0] * 2;
							},
							tests: [{ arg: 7 }],
						},
					],
				},
				{
					name: "Failure falls through to default expect (args[0])",
					tests: [
						{
							get expect () {
								throw new Error();
							},
							tests: [{ args: ["foo", "bar"], expect: "foo" }],
						},
					],
				},
			],
		},
	],
};
