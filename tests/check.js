import * as check from "../src/check.js";

export default {
	name: "Check tests",
	tests: [
		{
			name: "shallowEquals()",
			run: check.shallowEquals(),
			tests: [
				{
					args: [1, 1],
					expect: true,
				},
				{
					args: [1, 0],
					expect: false,
				},
				{
					args: [NaN, NaN],
					expect: true,
				},
				{
					args: [null, null],
					expect: true,
				},
			],
		},
		{
			name: "equals()",
			run: check.equals,
			tests: [
				{
					name: "Equal arrays",
					args: [
						[13, 15],
						[13, 15],
					],
					expect: true,
				},
				{
					name: "Arrays of different length",
					description: "Regression for #156 — `expect: []` used to match any array",
					args: [[1, 0], []],
					expect: false,
				},
			],
		},
		{
			name: "subset()",
			run: check.subset,
			tests: [
				{
					args: [1, undefined],
					expect: true,
				},
				{
					args: [1, undefined],
					expect: true,
				},
				{
					args: [{ foo: 1, bar: 2 }, { foo: 1 }],
					expect: true,
				},
				{
					args: [{ bar: 2 }, { foo: 1 }],
					expect: false,
				},
				{
					name: "Array missing first argument",
					args: [
						[1, 2, 3],
						[, 2, 3],
					],
					expect: true,
				},
				{
					name: "Array with fewer elements",
					args: [
						[1, 2, 3],
						[1, 2],
					],
					expect: false,
				},
				{
					name: "Array with fewer elements missing first argument",
					args: [
						[1, 2, 3],
						[, 2],
					],
					expect: false,
				},
				{
					args: [
						[1, 4, 3],
						[, 2],
					],
					expect: false,
				},
			],
		},
	],
};
