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
	],
};
