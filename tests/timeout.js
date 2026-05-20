export default {
	name: "Tests for timeout",
	description: "These tests are designed to fail.",
	run: () => new Promise(resolve => setTimeout(resolve, 200, "foo")),
	maxTime: 100,
	tests: [
		{
			name: "Result-based test",
			expect: "bar",
		},
		{
			name: "Error-based test",
			throws: error => !error.message.startsWith("Test timed out"),
		},
		{
			name: "Time-based test",
			maxTimeAsync: 100,
		},
		{
			name: "Default timeout",
			run: () => new Promise(resolve => setTimeout(resolve, 10200)),
			skip: true, // Comment this line out to see the test fail after 10 seconds
		},
	],
};
