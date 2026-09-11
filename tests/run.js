import Test from "../src/classes/Test.js";
import TestResult from "../src/classes/TestResult.js";
import BubblingEventTarget from "../src/classes/BubblingEventTarget.js";

// In run() rather than beforeAll(): a throwing beforeAll skips its tests, and a skipped test
// cannot fail CI. Memoized because both assertions read one child run.
let unloadable;
function runUnloadable () {
	return (unloadable ??= (async () => {
		let { spawnSync } = await import("node:child_process");
		let { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
		let { tmpdir } = await import("node:os");
		let { join } = await import("node:path");

		// ESM, because a CJS syntax error escapes as an unhandled rejection Node never hands us
		let dir = mkdtempSync(join(tmpdir(), "htest-unloadable-"));
		writeFileSync(join(dir, "package.json"), `{ "type": "module" }`);
		writeFileSync(join(dir, "good.js"), `export default { tests: [{ run: () => 1, expect: 1 }] };`);
		writeFileSync(join(dir, "broken.js"), `import missing from "./nope.js";\nexport default { tests: [] };`);

		let result = spawnSync(
			process.execPath,
			[join(process.cwd(), "bin/htest.js"), dir, "--ci"],
			{ encoding: "utf8" },
		);
		rmSync(dir, { recursive: true });

		return result;
	})());
}

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
			name: "JSON in a test's module graph loads (issue #181)",
			description: "Import attributes cannot be replayed, so such modules must not be re-imported for file tagging.",
			skip: typeof globalThis.process === "undefined",
			async run () {
				let { spawnSync } = await import("node:child_process");
				let { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
				let { tmpdir } = await import("node:os");
				let { join } = await import("node:path");

				let dir = mkdtempSync(join(tmpdir(), "htest-181-"));
				writeFileSync(join(dir, "data.json"), `{ "value": 42 }`);
				writeFileSync(
					join(dir, "test.mjs"),
					`import data from "./data.json" with { type: "json" };\nexport default { tests: [{ run: () => data.value, expect: 42 }] };`,
				);

				let { stdout, stderr } = spawnSync(
					process.execPath,
					[join(process.cwd(), "bin/htest.js"), join(dir, "test.mjs"), "--ci"],
					{ encoding: "utf8" },
				);
				rmSync(dir, { recursive: true });

				// Assert the inner test ran — an exit code of 0 also means "No tests found".
				// On regression the crash lands in stderr, so return it instead of a bare false.
				return stdout.includes("1/1 PASS") || stderr;
			},
			expect: true,
		},
		{
			name: "A test file that cannot be imported",
			description: "It fails on its own instead of taking down the run, so healthy siblings still report.",
			skip: typeof globalThis.process === "undefined",
			async run () {
				let { stdout, stderr } = await runUnloadable();

				// A failing run prints its tree to stderr, a crashing one its stack — assert across both.
				return stdout + stderr;
			},
			check: (actual, expect) => actual.includes(expect),
			tests: [
				{
					name: "Still runs the healthy files, and counts the broken one",
					description: "The denominator matters: dropping the broken file would report 1/1 and look fine.",
					expect: "1/2 PASS",
				},
				{
					name: "Names the file that failed to load",
					description: "Matching the row, not the output: the error text below it mentions the path either way.",
					expect: "FAIL  broken.js",
				},
			],
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
