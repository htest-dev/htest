import Test from "../src/classes/Test.js";
import TestResult from "../src/classes/TestResult.js";
import BubblingEventTarget from "../src/classes/BubblingEventTarget.js";

export default {
	name: "Run tests",
	tests: [
		{
			name: "run()",
			args: [],
			expect: "foo",
			tests: [
				{
					name: "Synchronous run()",
					run: () => "foo",
				},
				{
					name: "Asynchronous run()",
					run: async () => await Promise.resolve("foo"),
				},
				{
					name: "run() returning a promise",
					run: () => new Promise(resolve => setTimeout(() => resolve("foo"), 100)),
				},
			],
		},
		{
			name: "afterAll runs in --ci mode (issue #168)",
			skip: typeof globalThis.process === "undefined",
			async run () {
				let { spawnSync } = await import("node:child_process");
				let { writeFileSync, rmSync } = await import("node:fs");
				let { tmpdir } = await import("node:os");
				let { join } = await import("node:path");

				let fixture = join(tmpdir(), "htest-168.js");
				writeFileSync(
					fixture,
					`export default { async afterAll () { await new Promise(r => setTimeout(r, 50)); process.stderr.write("[test] afterAll ran"); }, tests: [{ run: () => 1, expect: 1 }] };`,
				);

				let { stderr } = spawnSync(
					process.execPath,
					[join(process.cwd(), "bin/htest.js"), fixture, "--ci"],
					{ encoding: "utf8" },
				);
				rmSync(fixture);

				return stderr.includes("[test] afterAll ran");
			},
			expect: true,
		},
		{
			name: "Aborting",
			tests: [
				{
					name: "Abort mid-flight skips run()",
					async run () {
						let controller = new AbortController();
						let ran = false;
						let test = new Test({
							beforeEach () {
								controller.abort();
							},
							run () {
								ran = true;
							},
						});
						let result = new TestResult(test, new BubblingEventTarget(), {
							signal: controller.signal,
						});
						await result.run();
						return ran;
					},
					expect: false,
				},
				{
					name: "Abort mid-flight still runs afterEach()",
					async run () {
						let controller = new AbortController();
						let ran = false;
						let test = new Test({
							beforeEach () {
								controller.abort();
							},
							afterEach () {
								ran = true;
							},
							run () {},
						});
						let result = new TestResult(test, new BubblingEventTarget(), {
							signal: controller.signal,
						});
						await result.run();
						return ran;
					},
					expect: true,
				},
				{
					name: "Pre-aborted signal skips beforeAll()",
					async run () {
						let ran = false;
						let test = new Test({
							beforeAll () {
								ran = true;
							},
							tests: [{ run () {} }],
						});
						let result = new TestResult(test, null, { signal: AbortSignal.abort() });
						result.runAll();
						await result.finished;
						return ran;
					},
					expect: false,
				},
				{
					name: "Pre-aborted signal skips beforeEach()",
					async run () {
						let ran = false;
						let test = new Test({
							tests: [
								{
									beforeEach () {
										ran = true;
									},
									run () {},
								},
							],
						});
						let result = new TestResult(test, null, { signal: AbortSignal.abort() });
						result.runAll();
						await result.finished;
						return ran;
					},
					expect: false,
				},
				{
					name: "Pre-aborted signal still runs afterAll()",
					async run () {
						let { promise, resolve } = Promise.withResolvers();
						let test = new Test({
							afterAll () {
								resolve(true);
							},
							tests: [{ run () {} }],
						});
						let result = new TestResult(test, null, { signal: AbortSignal.abort() });
						result.runAll();
						return promise;
					},
					expect: true,
				},
			],
		},
	],
};
