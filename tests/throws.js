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
			name: "Failing tests",
			description: "These tests are designed to fail.",
			tests: [
				{
					name: "Expect error",
					run: () => "foo",
					throws: true,
				},
				{
					name: "Expect no error",
					run: () => {
						throw new Error();
					},
					throws: false,
				},
				{
					name: "Subclass",
					run: () => {
						throw new SyntaxError();
					},
					throws: TypeError,
				},
			],
		},
	],
};
