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
					expect: true,
				},
				{
					name: "Array with fewer elements missing first argument",
					args: [
						[1, 2, 3],
						[, 2],
					],
					expect: true,
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
