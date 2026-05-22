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
				return result.error?.message;
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
			name: "Hook throws → skip",
			async run (test) {
				let result = await runTest(test);
				return result.skipped;
			},
			expect: true,
			tests: [
				{
					name: "beforeEach",
					arg: {
						beforeEach () {
							throw new Error("setup failed");
						},
						arg: "foo",
						expect: "foo",
					},
				},
				{
					name: "afterEach",
					arg: {
						afterEach () {
							throw new Error("teardown failed");
						},
						arg: "foo",
						expect: "foo",
					},
				},
			],
		},
		{
			name: "Hook throws → skip (isolation)",
			async run (test) {
				let result = await runTest(test, null);
				return result.skipped;
			},
			expect: true,
			tests: [
				{
					name: "beforeAll",
					arg: {
						beforeAll () {
							throw new Error("group setup failed");
						},
						arg: "foo",
						expect: "foo",
					},
				},
				{
					name: "afterAll",
					arg: {
						afterAll () {
							throw new Error("cleanup failed");
						},
						arg: "foo",
						expect: "foo",
					},
				},
			],
		},
		{
			name: "Setup throws → cleanup still runs",
			expect: true,
			tests: [
				{
					name: "beforeAll throws → afterAll still runs",
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
								arg: "foo",
								expect: "foo",
							},
							null,
						);
						return ran;
					},
				},
				{
					name: "beforeEach throws → afterEach still runs",
					async run () {
						let ran = false;
						await runTest({
							beforeEach () {
								throw new Error("setup failed");
							},
							afterEach () {
								ran = true;
							},
							arg: "foo",
							expect: "foo",
						});
						return ran;
					},
				},
			],
		},
		{
			name: "Group beforeAll throws → all children skipped",
			async run () {
				let test = new Test({
					beforeAll () {
						throw new Error("group setup failed");
					},
					tests: [
						{ arg: "a", expect: "a" },
						{ arg: "b", expect: "b" },
					],
				});
				let result = new TestResult(test);
				result.runAll();
				await result.finished;
				let { skipped, total } = result.stats;
				return { skipped, total };
			},
			expect: { skipped: 2, total: 2 },
		},
		{
			name: "Hook error → details show source and message",
			async run () {
				let result = await runTest({
					beforeEach () {
						throw new Error("setup failed");
					},
					arg: "foo",
					expect: "foo",
				});
				return result.details[0];
			},
			expect: "beforeEach: setup failed",
		},
		{
			name: "Group afterAll throws → results unaffected",
			async run () {
				let test = new Test({
					tests: [{ run: () => "a", expect: "a" }],
					afterAll () {
						throw new Error("cleanup failed");
					},
				});
				let result = new TestResult(test);
				result.runAll();
				await result.finished;
				return result.stats.pass;
			},
			expect: 1,
		},
		{
			name: "beforeEach throws + throws: true → skip, not pass",
			async run () {
				let result = await runTest({
					throws: true,
					beforeEach () {
						throw new Error("setup failed");
					},
					run: () => "foo",
				});
				return result.skipped;
			},
			expect: true,
		},
		{
			name: "run throws + afterEach throws → skip",
			async run () {
				let result = await runTest({
					throws: true,
					run () {
						throw new Error("expected");
					},
					afterEach () {
						throw new Error("teardown");
					},
				});
				return result.skipped;
			},
			expect: true,
		},
		{
			name: "AssertionError treated as failure (issue #114)",
			skip: typeof globalThis.process === "undefined",
			async run () {
				let { strict: assert } = await import("node:assert");
				let result = await runTest({
					run () {
						assert.equal("hello".toUpperCase(), "hello");
					},
					expect: "HELLO",
				});
				return { actual: result.actual, expected: result.test.expect, pass: result.pass };
			},
			expect: { actual: "HELLO", expected: "hello", pass: false },
		},
	],
};
