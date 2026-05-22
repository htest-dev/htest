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
		{
			name: "getData",
			tests: [
				{
					name: "Called with test args",
					getData (x) {
						return { doubled: x * 2 };
					},
					run () {
						return this.data.doubled;
					},
					tests: [{ arg: 5, expect: 10 }],
				},
				{
					name: "Fresh data per test",
					getData () {
						return { items: [] };
					},
					run () {
						this.data.items.push("foo");
						return this.data.items.length;
					},
					tests: [{ expect: 1 }, { expect: 1 }],
				},
				{
					name: "Function shorthand",
					data () {
						return { x: 42 };
					},
					run () {
						return this.data.x;
					},
					tests: [{ expect: 42 }],
				},
				{
					name: "Literal data wins over inherited getData",
					getData () {
						return { x: "generated" };
					},
					tests: [
						{
							data: { x: "literal" },
							run () {
								return this.data.x;
							},
							expect: "literal",
						},
					],
				},
				{
					name: "Merges with parent data",
					data: { parent: 1 },
					tests: [
						{
							getData () {
								return { child: 2 };
							},
							run () {
								return {
									parent: this.data.parent,
									child: this.data.child,
								};
							},
							expect: { parent: 1, child: 2 },
						},
					],
				},
				{
					name: "Preserves accessor descriptors",
					getData () {
						return {
							get items () {
								return [];
							},
						};
					},
					run () {
						return this.data.items !== this.data.items;
					},
					expect: true,
				},
				{
					name: "Getter failure falls through to empty data",
					getData () {
						throw new Error("Fail");
					},
					run () {
						return this.data;
					},
					expect: {},
				},
			],
		},
	],
};
