export default {
	name: "this.parent",
	run (x) {
		return x * 2;
	},
	tests: [
		{
			name: "this.parent.foo() resolves to ancestor version when inherited",
			tests: [
				{
					run (x) {
						return this.parent.run(x) + 1;
					},
					tests: [{ arg: 3, expect: 7 }],
				},
			],
		},
		{
			name: "this.parent.foo() skips levels that didn't redefine it",
			beforeEach () {
				this.data.calls = ["root"];
			},
			tests: [
				{
					name: "Level 1",
					// No beforeEach; skip to the root level
					tests: [
						{
							name: "Level 2",
							tests: [
								{
									beforeEach () {
										this.parent.beforeEach();
										(this.data.calls ??= []).push(this.name);
									},
									run () {
										return this.data.calls;
									},
									tests: [{ name: "Level 3", expect: ["root", "Level 3"] }],
								},
							],
						},
					],
				},
			],
		},
	],
};
