import Test from "../src/classes/Test.js";

let add = (a, b) => a + b;

export default {
	name: "Accessors",
	tests: [
		{
			name: "Getters do not fire during Test construction",
			run () {
				let log = [];
				new Test({
					get arg () {
						log.push("arg");
						return 42;
					},
					get expect () {
						log.push("expect");
						return 84;
					},
					get name () {
						log.push("name");
						return "test";
					},
					get check () {
						log.push("check");
						return (a, b) => a === b;
					},
					get data () {
						log.push("data");
						return { x: 1 };
					},
					run (x) {
						return x * 2;
					},
				});
				return log;
			},
			expect: [],
		},
		{
			name: "Getters resolve to correct values on access",
			run () {
				let test = new Test({
					get arg () {
						return 42;
					},
					get expect () {
						return 84;
					},
					run (x) {
						return x * 2;
					},
				});
				return { args: test.args, expect: test.expect };
			},
			expect: { args: [42], expect: 84 },
		},
		{
			name: "get arg() — children inherit resolved value",
			run () {
				let test = new Test({
					get arg () {
						return 42;
					},
					run (x) {
						return x;
					},
					tests: [{}],
				});
				return test.tests[0].args;
			},
			expect: [42],
		},
		{
			name: "Parent getters do not fire during child construction",
			run () {
				let log = [];
				new Test({
					get data () {
						log.push("parent-data");
						return { x: 1 };
					},
					get name () {
						log.push("parent-name");
						return "parent";
					},
					run (x) {
						return x;
					},
					tests: [{ arg: 1 }, { arg: 2 }],
				});
				return log;
			},
			expect: [],
		},
		{
			name: "get name() — inherited by children",
			run () {
				let test = new Test({
					get name () {
						return "computed " + this.arg;
					},
					run (x) {
						return x;
					},
					tests: [{ arg: 7 }],
				});
				return test.tests[0].name;
			},
			expect: "computed 7",
		},
		{
			name: "get name() — own getter wins over inherited getName",
			run () {
				let test = new Test({
					getName () {
						return "parent";
					},
					run (x) {
						return x;
					},
					tests: [
						{
							get name () {
								return "child";
							},
							arg: 1,
						},
					],
				});
				return test.tests[0].name;
			},
			expect: "child",
		},
		{
			name: "get name() — failure falls through to default",
			run () {
				let test = new Test({
					get name () {
						throw new Error();
					},
					arg: 42,
				});
				return test.name;
			},
			expect: "42",
		},
		{
			name: "get name() — fails on group without run, works on children",
			run () {
				let test = new Test({
					get name () {
						return this.run.name + "()";
					},
					tests: [{
						run: function foo () {
							return 42;
						},
						arg: "foo",
					}],
				});
				return test.tests[0].name;
			},
			expect: "foo()",
		},
		{
			name: "get expect() — accesses test args",
			get expect () {
				return this.arg * 2;
			},
			run (x) {
				return x * 2;
			},
			arg: 5,
		},
		{
			name: "get arg() — lazy arg property resolves on access",
			run () {
				let test = new Test({
					get arg () {
						return 42;
					},
				});
				return test.arg;
			},
			expect: 42,
		},
		{
			name: "get expect() — explicit expect wins over inherited getter",
			get expect () {
				return "generated";
			},
			run () {
				return "explicit";
			},
			tests: [{ arg: "foo", expect: "explicit" }],
		},
		{
			name: "get expect() — own getter wins over inherited plain expect",
			run () {
				let test = new Test({
					expect: "parent",
					run () {
						return "child";
					},
					tests: [
						{
							get expect () {
								return "child";
							},
						},
					],
				});
				return test.tests[0].expect;
			},
			expect: "child",
		},
		{
			name: "get expect() — failure falls through to args[0]",
			get expect () {
				throw new Error();
			},
			run (x) {
				return x;
			},
			arg: "foo",
		},
		{
			name: "get data() — fresh per test",
			description: "Each sibling gets its own data object, mutations don't leak",
			run () {
				let test = new Test({
					get data () {
						return { items: [] };
					},
					run () {
						return this.data;
					},
					tests: [{}, {}],
				});
				test.tests[0].data.items.push("a");
				return { first: test.tests[0].data.items, second: test.tests[1].data.items };
			},
			expect: { first: ["a"], second: [] },
		},
		{
			name: "get data() — merges with parent data",
			run () {
				let test = new Test({
					data: { parent: 1 },
					tests: [
						{
							get data () {
								return { child: 2 };
							},
							run () {
								return this.data;
							},
							tests: [{}],
						},
					],
				});
				let data = test.tests[0].data;
				return { parent: data.parent, child: data.child };
			},
			expect: { parent: 1, child: 2 },
		},
		{
			name: "name() shorthand — inherited by children",
			run () {
				let test = new Test({
					name () {
						return "group " + this.level;
					},
					tests: [{ arg: 42 }],
				});
				return { parent: test.name, child: test.tests[0].name };
			},
			expect: { parent: "group 0", child: "group 1" },
		},
		{
			name: "data() shorthand — provides fresh data per test",
			run () {
				let test = new Test({
					data () {
						return { x: 42 };
					},
					run () {
						return this.data.x;
					},
					tests: [{}, {}],
				});
				return { first: test.tests[0].data.x, second: test.tests[1].data.x };
			},
			expect: { first: 42, second: 42 },
		},
		{
			name: "get data() — failure falls through to empty data",
			run () {
				let test = new Test({
					get data () {
						throw new Error();
					},
				});
				return Object.keys(test.data);
			},
			expect: [],
		},
		{
			name: "get check() — getter return value is used as check function",
			run () {
				let custom = () => "custom";
				let test = new Test({
					get check () {
						return custom;
					},
				});
				return test.check();
			},
			expect: "custom",
		},
		{
			name: "get check() — throwing getter falls back to equality",
			run () {
				let test = new Test({
					get check () {
						throw new Error();
					},
				});
				return { same: test.check(1, 1), diff: test.check(1, 2) };
			},
			expect: { same: true, diff: false },
		},
		{
			name: "Function shorthand receives test args",
			run () {
				let test = new Test({
					skip (x) {
						return x > 100;
					},
					run (x) {
						return x;
					},
					tests: [{ arg: 5 }, { arg: 200 }],
				});
				return [test.tests[0].skip, test.tests[1].skip];
			},
			expect: [false, true],
		},
		{
			name: "Function-valued expect is not called as a factory",
			description: "expect can be a function value (the expected result *is* a function)",
			run () {
				let test = new Test({ expect: add });
				return test.expect;
			},
			expect: add,
		},
	],
};
