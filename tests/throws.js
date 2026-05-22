import Test from "../src/classes/Test.js";
import TestResult from "../src/classes/TestResult.js";

export default {
	name: "Tests for error-based criteria",
	tests: [
		{
			name: "Any error",
			run: () => {
				throw new TypeError();
			},
			throws: true,
		},
		{
			name: "Function",
			run: () => {
				throw new TypeError();
			},
			throws: error => error.constructor === TypeError,
		},
		{
			name: "Subclass",
			run: () => {
				throw new SyntaxError();
			},
			throws: SyntaxError,
		},
		{
			name: "Expect no error",
			run: () => "bar",
			throws: false,
		},
		{
			name: "Return meaningful error message when expectation is not met",
			async run (test) {
				test = new Test(test);
				let result = new TestResult(test);
				await result.run();
				return result.details[0];
			},
			check (actual, expected) {
				return actual.includes(expected);
			},
			tests: [
				{
					name: "Expect error but none thrown",
					arg: {
						run: () => "foo",
						throws: true,
					},
					expect: "Expected error but",
				},
				{
					name: "Expect no error but one thrown",
					arg: {
						run: () => {
							throw new Error();
						},
						throws: false,
					},
					expect: "Expected no error",
				},
				{
					name: "Function returns falsy value",
					arg: {
						run: () => {
							throw new TypeError();
						},
						throws: error => error.constructor === SyntaxError,
					},
					expect: "but didn’t pass test",
				},
				{
					name: "Wrong error subclass",
					arg: {
						run: () => {
							throw new SyntaxError();
						},
						throws: TypeError,
					},
					expect: "but was not a subclass",
				},
			],
		},
	],
};
