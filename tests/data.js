export default {
	name: "data inheritance",
	tests: [
		{
			name: "Child own data shadows parent",
			data: { x: 1 },
			tests: [
				{
					data: { x: 2 },
					run () {
						return this.data.x;
					},
					expect: 2,
				},
			],
		},
		{
			name: "Child data merges with parent data",
			data: { a: 1 },
			run () {
				return { a: this.data.a, b: this.data.b };
			},
			tests: [
				{
					data: { b: 2 },
					expect: { a: 1, b: 2 },
				},
			],
		},
		{
			name: "Lifecycle hooks set data visible to children",
			data: { root: "foo" },
			beforeAll () {
				this.data.all = 42;
			},
			run () {
				return {
					root: this.data.root,
					all: this.data.all,
					each: this.data.each,
				};
			},
			tests: [
				{
					beforeEach () {
						this.data.each = 99;
					},
					tests: [{ expect: { root: "foo", all: 42, each: 99 } }],
				},
			],
		},
	],
};
