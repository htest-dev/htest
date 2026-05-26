import Test from "../src/classes/Test.js";

export default {
	name: "Defaults and inheritance",
	tests: [
		{
			name: "No name → auto-generated from args",
			run () {
				let test = new Test({ arg: 42 });
				return test.name;
			},
			expect: "42",
		},
		{
			name: "No expect → defaults to args[0]",
			run () {
				let test = new Test({ arg: 42 });
				return test.expect;
			},
			expect: 42,
		},
		{
			name: "expect inherits from parent",
			run () {
				let test = new Test({
					expect: "foo",
					run () {
						return "foo";
					},
					tests: [{}],
				});
				return test.tests[0].expect;
			},
			expect: "foo",
		},
		{
			name: "name string does not inherit",
			run () {
				let test = new Test({
					name: "Parent Group",
					run (x) {
						return x;
					},
					tests: [{ arg: 42 }],
				});
				return test.tests[0].name;
			},
			expect: "42",
		},
		{
			name: "check: { subset: true } ignores extra properties",
			run () {
				let test = new Test({ check: { subset: true } });
				return test.check({ a: 1, b: 2 }, { a: 1 });
			},
			expect: true,
		},
		{
			name: "check: { deep: true } matches nested objects by value",
			description: "Without deep, { b: 1 } !== { b: 1 } (different references)",
			run () {
				let test = new Test({ check: { deep: true } });
				return test.check({ a: { b: 1 } }, { a: { b: 1 } });
			},
			expect: true,
		},
		{
			name: "arg inherits via args",
			run () {
				let test = new Test({
					arg: 1,
					run (x) {
						return x;
					},
					tests: [{}],
				});
				return test.tests[0].args;
			},
			expect: [1],
		},
		{
			name: "arg overrides inherited args",
			run () {
				let test = new Test({
					args: [1, 2],
					run (x) {
						return x;
					},
					tests: [{ arg: 5 }],
				});
				return test.tests[0].args;
			},
			expect: [5],
		},
	],
};
