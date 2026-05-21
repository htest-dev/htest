export default {
	name: "Failing tests",
	description: "These tests are designed to fail and should not break the test runner",
	tests: [
		{
			name: "map() fails",
			map: arg => arg.length,
		},
		{
			name: "check() fails",
			check: (actual, expected) => actual.length < expected.length,
		},
		{
			name: "map() → check() fails",
			map: arg => undefined,
			check: (actual, expected) => actual.length < expected.length,
			arg: 42,
			expect: 42,
		},
		{
			name: "beforeEach() throws",
			beforeEach () {
				throw new Error("setup failed");
			},
			run: () => "foo",
			expect: "foo",
		},
	],
};
