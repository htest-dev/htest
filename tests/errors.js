import Test from "../src/classes/Test.js";
import TestResult from "../src/classes/TestResult.js";
import BubblingEventTarget from "../src/classes/BubblingEventTarget.js";

async function runTest (test, parent = new BubblingEventTarget()) {
	test = new Test(test);
	let result = new TestResult(test, parent);
	await result.run();
	return result;
}

export default {
	name: "Error handling",
	tests: [
		{
			name: "Evaluation",
			async run (test) {
				let result = await runTest(test);
				return result.error.evaluation?.message;
			},
			check: (actual, expected) => actual?.startsWith(expected),
			tests: [
				{
					name: "map() error is caught",
					arg: { map: arg => arg.length },
					expect: "map() failed",
				},
				{
					name: "check() error is caught",
					arg: {
						check () {
							throw new Error("check broke");
						},
					},
					expect: "check() failed",
				},
				{
					name: "check() error after map() is caught",
					arg: {
						map: () => undefined,
						check: (a, b) => a.length < b.length,
						arg: 42,
						expect: 42,
					},
					expect: "check() failed (working with mapped values)",
				},
			],
		},
		{
			name: "Hooks",
			tests: [
				{
					name: "Throwing afterEach fails the test",
					async run () {
						let result = await runTest({
							afterEach () {
								throw new Error("teardown failed");
							},
						});
						return result.pass;
					},
					expect: false,
				},
				{
					name: "Teardown runs after setup failure",
					async run () {
						let ran = false;
						let result = await runTest({
							beforeEach () {
								throw new Error("setup failed");
							},
							afterEach () {
								ran = true;
							},
							run: () => "should not run",
						});
						return { ran, actual: result.actual };
					},
					expect: { ran: true, actual: undefined },
				},
				{
					name: "afterAll runs after beforeAll failure (isolation)",
					async run () {
						let ran = false;
						await runTest(
							{
								beforeAll () {
									throw new Error("group setup failed");
								},
								afterAll () {
									ran = true;
								},
							},
							null,
						);
						return ran;
					},
					expect: true,
				},
				{
					name: "afterAll error is caught (isolation)",
					async run () {
						let result = await runTest(
							{
								afterAll () {
									throw new Error("cleanup failed");
								},
							},
							null,
						);
						return result.error.hooks.afterAll?.message;
					},
					expect: "cleanup failed",
				},
				{
					name: "Run and hook errors coexist",
					async run () {
						let result = await runTest({
							run () {
								throw new Error("test");
							},
							afterEach () {
								throw new Error("teardown");
							},
						});
						return {
							run: result.error.run?.message,
							afterEach: result.error.hooks.afterEach?.message,
						};
					},
					expect: { run: "test", afterEach: "teardown" },
				},
			],
		},
		{
			name: "Tests with error-based criteria",
			async run (test) {
				let result = await runTest({ throws: true, ...test });
				return result.pass;
			},
			expect: false,
			tests: [
				{
					name: "Hook error does not fulfill throws",
					arg: {
						beforeEach () {
							throw new Error("setup failed");
						},
						run: () => "foo",
					},
				},
				{
					name: "afterEach error overrides fulfilled throws",
					arg: {
						run () {
							throw new Error("expected");
						},
						afterEach () {
							throw new Error("teardown");
						},
					},
				},
			],
		},
	],
};
