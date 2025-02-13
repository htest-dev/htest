import BubblingEventTarget from "./BubblingEventTarget.js";
import format, { stripFormatting } from "../format-console.js";
import { delay, formatDuration, interceptConsole, pluralize, stringify, formatDiff } from "../util.js";
import { IS_NODEJS } from "../util.js";

// Make the diff package available both in Node.js and the browser
const { diffChars } = await import(IS_NODEJS ? "diff" : "https://cdn.jsdelivr.net/npm/diff@7.0.0/lib/index.es6.js");

/**
 * Represents the result of a test or group of tests.
 */
export default class TestResult extends BubblingEventTarget {
	pass;
	details = [];
	timeTaken = 0;
	stats = {};

	/**
	 *
	 * @param {object} test
	 * @param {object} [parent = null]
	 * @param {object} [options]
	 * @param {string | string[] | number | number[]} [options.only] Only run a subset of tests
	 *        If one or more numbers, or a string that begins with a number, it is a path to a test/group
	 *        If one or more identifiers, it will only run tests with that id, regardless of nesting
	 *        If mixed, it will follow the numbers as a path, then will not consume any more numbers until it finds the id.
	 * @param {boolean} [options.verbose] Show all tests, not just failed ones
	 */
	constructor (test, parent, options = {}) {
		super();

		this.test = test;
		this.parent = parent ?? null;
		this.options = options;

		if (this.options.only) {
			this.options.only = Array.isArray(this.options.only) ? this.options.only : [this.options.only];
		}

		this.addEventListener("done", e => {
			let originalTarget = e.detail?.target ?? e.target;

			if (originalTarget.test.isTest) {
				if (originalTarget.test.skip) {
					this.stats.skipped++;
				}
				else if (originalTarget.pass) {
					this.stats.pass++;
				}
				else {
					this.stats.fail++;
				}

				if (originalTarget.messages?.length > 0) {
					this.stats.messages += originalTarget.messages.length;
				}

				this.timeTaken += originalTarget.timeTaken;

				if (originalTarget.timeTakenAsync) {
					this.timeTakenAsync ??= 0;
					this.timeTakenAsync += originalTarget.timeTakenAsync;
				}

				this.stats.pending--;

				if (this.stats.pending <= 0) {
					this.dispatchEvent(new Event("finish"));
				}
			}
		});
	}

	get name () {
		return this.test.name;
	}

	warn (msg) {
		return Test.prototype.warn.call(this, msg);
	}

	/**
	 * Run the test(s)
	 */
	async run () {
		let test = this.test;

		let timeoutId;
		if (test.maxTime || test.maxTimeAsync) {
			// Add a buffer to account for the time it takes to evaluate the test
			let timeout = Math.max(test.maxTime ?? 0, test.maxTimeAsync ?? 0) + 50;

			timeoutId = setTimeout(() => {
				this.error = new Error("Timed out");
				this.timeTaken = timeout;

				this.evaluate();
			}, timeout);
		}

		this.messages = await interceptConsole(async () => {
			if (!this.parent) {
				// We are running the test in isolation, so we need to run beforeAll (if it exists)
				await test.beforeAll?.();
			}

			await test.beforeEach?.();

			let start = performance.now();

			try {
				this.actual = test.run ? test.run.apply(test, test.args) : test.args[0];
				this.timeTaken = performance.now() - start;

				if (this.actual instanceof Promise) {
					this.actual = await this.actual;
					this.timeTakenAsync = performance.now() - start;
				}
			}
			catch (e) {
				this.error = e;
			}
			finally {
				await test.afterEach?.();

				if (!this.parent) {
					// We are running the test in isolation, so we need to run afterAll
					await test.afterAll?.();
				}
			}
		});

		if (timeoutId) {
			// If we are here, the test didn't timeout
			// Clean up
			clearTimeout(timeoutId);
		}

		this.evaluate();
	}

	static STATS_AVAILABLE = ["pass", "fail", "error", "skipped", "total", "totalTime", "totalTimeAsync", "messages"];

	/**
	 * Run all tests in the group
	 * @returns {TestResult}
	 */
	runAll () {
		this.stats = Object.fromEntries(TestResult.STATS_AVAILABLE.map(k => [k, 0]));
		this.stats.total = this.test.testCount;
		this.stats.pending = this.stats.total;
		this.finished = new Promise(resolve => this.addEventListener("finish", resolve, {once: true}));

		let tests = this.test.tests;
		let childOptions = Object.assign({}, this.options);

		this.dispatchEvent(new Event("start", {bubbles: true}));

		if (this.options.only) {
			childOptions.only = childOptions.only.slice();
			let first = childOptions.only[0];
			if (/^\d/.test(first)) { // Path
				// TODO ranges (e.g. "0-5")
				tests = [tests[first]];
				childOptions.only.unshift();
			}
			else {
				// Id
				let test = tests.find(t => t.id === first);

				if (test) {
					tests = [test];
					// We only remove the id if found, since otherwise it may be found in a descendant
					childOptions.only.unshift();
				}
			}
		}

		this.tests = this.test.tests?.map(t => new TestResult(t, this, childOptions));

		delay(1)
			.then(() => this.test.beforeAll?.())
			.then(() => {
				if (this.test.isTest) {
					if (this.test.skip) {
						this.skip();
					}
					else {
						this.run();
					}
				}

				return Promise.allSettled((this.tests ?? []).map(test => test.runAll()));
			})
			.then(() => this.finished)
			.finally(() => this.test.afterAll?.());

		return this;
	}

	/**
	 * Evaluate the result of the test
	 */
	evaluate () {
		let test = this.test;

		if (test.throws !== undefined) {
			Object.assign(this, this.evaluateThrown());
		}
		else if (test.expect === undefined && (test.maxTime || test.maxTimeAsync)) {
			Object.assign(this, this.evaluateTimeTaken());
		}
		else {
			Object.assign(this, this.evaluateResult());
		}

		this.dispatchEvent(new Event("done", {bubbles: true}));
	}

	/**
	 * Skip the test
	 */
	skip () {
		this.dispatchEvent(new Event("done", {bubbles: true}));
	}

	/**
	 * Evaluate whether a thrown error is as expected
	 * @returns {{pass, details: string[]}
	 */
	evaluateThrown () {
		let test = this.test;
		let ret = {pass: !!this.error, details: []};

		// We may have more picky criteria for the error
		if (ret.pass) {
			if (test.throws === false) {
				// We expect no error, but got one
				ret.pass = false;
				ret.details.push(`Expected no error, but got ${ this.error }`);
			}
			else if (test.throws.prototype instanceof Error) {
				// We want a specific subclass, e.g. TypeError
				ret.pass &&= this.error instanceof test.throws;

				if (!ret.pass) {
					ret.details.push(`Got error ${ this.error }, but was not a subclass of ${ test.throws.name }`);
				}
			}
			else if (typeof test.throws === "function") {
				ret.pass &&= test.throws(this.error);

				if (!ret.pass) {
					ret.details.push(`Got error ${ this.error }, but didn’t pass test ${ test.throws }`);
				}
			}
		}
		else if (test.throws === false) {
			// We expect no error and got none, so this is good
			ret.pass = true;
		}
		else {
			ret.details.push(`Expected error but ${ this.actual !== undefined ? `got ${ stringify(this.actual) }` : "none was thrown" }`);
		}

		return ret;
	}

	/**
	 * Evaluate whether the test passed or failed
	 * @returns {{pass, details: string[]}}
	 */
	evaluateResult () {
		let test = this.test;
		let ret = {pass: true, details: []};

		if (test.map) {
			try {
				this.mapped = {
					actual: Array.isArray(this.actual) ? this.actual.map(test.map) : test.map(this.actual),
					expect: Array.isArray(test.expect) ? test.expect.map(test.map) : test.map(test.expect),
				};

				try {
					ret.pass = test.check(this.mapped.actual, this.mapped.expect);
				}
				catch (e) {
					this.error = new Error(`check() failed (working with mapped values). ${ e.message }`);
				}
			}
			catch (e) {
				this.error = new Error(`map() failed. ${ e.message }`);
			}
		}
		else {
			try {
				ret.pass = test.check(this.actual, test.expect);
			}
			catch (e) {
				this.error = new Error(`check() failed. ${ e.message }`);
			}
		}

		// If `map()` or `check()` errors, consider the test failed
		if (this.error) {
			ret.pass = false;
		}

		if (!ret.pass) {
			if (this.error) {
				ret.details.push(`Got error ${ this.error }
${ this.error.stack }`);
			}
			else {
				let actual = this.mapped?.actual ?? this.actual;
				let actualString = stringify(actual);

				let message;
				if ("expect" in test) {
					let expect = this.mapped?.expect ?? test.expect;
					let expectString = stringify(expect);

					let changes = diffChars(actualString, expectString);

					// Calculate output lengths to determine formatting style
					let actualLength = actualString.length;
					if (this.mapped && actual !== this.actual) {
						actualLength += stringify(this.actual).length;
					}

					let expectedLength = expectString.length;
					if (this.mapped && expect !== test.expect) {
						expectedLength += stringify(test.expect).length;
					}

					// TODO: Use global (?) option instead of the magic number 40
					let inline = Math.max(actualLength, expectedLength) <= 40;
					if (inline) {
						message = `Got ${ formatDiff(changes) }`;
						if (this.mapped && actual !== this.actual) {
							message += ` <dim>(${ stringify(this.actual) } unmapped)</dim>`;
						}

						message += `, expected ${ formatDiff(changes, { expected: true }) }`;
						if (this.mapped && expect !== test.expect) {
							message += ` <dim>(${ stringify(test.expect) } unmapped)</dim>`;
						}
					}
					else {
						// Vertical format for long values
						message = "\n Actual:   " + formatDiff(changes);
						if (this.mapped && actual !== this.actual) {
							message += `\n\t\t  <dim>${ stringify(this.actual) } unmapped</dim>`;
						}

						message += "\n Expected: " + formatDiff(changes, { expected: true });
						if (this.mapped && expect !== test.expect) {
							message += `\n\t\t  <dim>${ stringify(test.expect) } unmapped</dim>`;
						}
					}
				}
				else {
					message = `Got ${ actualString }`;
					if (this.mapped && actual !== this.actual) {
						message += ` <dim>(${ stringify(this.actual) } unmapped)</dim>`;
					}
					message += " which doesn't pass the test provided";
				}

				ret.details.push(message);
			}
		}

		return ret;
	}

	/**
	 * Evaluate whether the test took too long (for tests with time constraints)
	 * @returns {{pass, details: string[]}}
	 */
	evaluateTimeTaken () {
		let test = this.test;
		let ret = {pass: true, details: []};

		if (this.error && this.error.message.includes("Timed out")) {
			ret.pass = false;
			ret.details.push(`Test timed out after ${ this.timeTaken }ms`);

			return ret;
		}

		if (test.maxTime) {
			ret.pass &&= this.timeTaken <= test.maxTime;

			if (!ret.pass) {
				ret.details.push(`Exceeded max time of ${ test.maxTime }ms (took ${ this.timeTaken }ms)`);
			}
		}

		if (test.maxTimeAsync) {
			ret.pass &&= this.timeTakenAsync <= test.maxTimeAsync;

			if (!ret.pass) {
				ret.details.push(`Exceeded max async time of ${ test.maxTimeAsync }ms (took ${ this.timeTakenAsync }ms)`);
			}
		}

		return ret;
	}

	get isLast () {
		return this.parent.tests[this.parent.tests.length - 1] === this;
	}

	/**
	 * Get a string representation of the test result
	 * @param {object} [o]
	 * @returns {string}
	 */
	getResult (o) {
		let color = this.pass ? "green" : "red";
		let ret = [
			`<b><bg ${color}><c white> ${ this.pass ? "PASS" : "FAIL" } </c></bg></b>`,
			`<c light${color}>${this.name ?? "(Anonymous)"}</c>`,
		].join(" ");

		if (this.messages?.length > 0) {
			let suffix = pluralize(this.messages.length, "message", "messages");
			ret += ` <dim><b>${ this.messages.length }</b> ${ suffix }</dim>`;
		}

		ret += ` <dim>(${ formatDuration(this.timeTaken ?? 0) })</dim>`;

		if (this.details?.length > 0) {
			ret += ": " + this.details.join(", ");
		}

		return o?.format === "rich" ? ret : stripFormatting(ret);
	}

	/**
	 * Get a summary of the current status of the test
	 * @param {object} [o] Options
	 * @param {"rich" | "plain"} [o.format="rich"] Format to use for output. Defaults to "rich"
	 * @returns {string}
	 */
	getSummary (o = {}) {
		let stats = this.stats;
		let ret = [
			`${this.name ?? (this.test.level === 0 ? "<i>(All tests)</i>" : "")}`,
		];

		if (stats.pass > 0) {
			ret.push(`<c green><b>${ stats.pass }</b>/${ stats.total } PASS</c>`);
		}

		if (stats.fail > 0) {
			ret.push(`<c red><b>${ stats.fail }</b>/${ stats.total } FAIL</c>`);
		}

		if (stats.pending > 0) {
			ret.push(`<b>${ stats.pending }</b>/${ stats.total } remaining`);
		}

		if (stats.skipped > 0) {
			ret.push(`<dim><b>${ stats.skipped }</b>/${ stats.total } skipped</dim>`);
		}

		if (stats.messages > 0) {
			let suffix = pluralize(stats.messages, "message", "messages");
			ret.push(`<dim><b>${ stats.messages }</b> ${ suffix }</dim>`);
		}

		let icon = stats.fail > 0 ? "❌" : stats.pending > 0 ? "⏳" : "✅";
		ret.splice(1, 0, icon);

		if (this.timeTaken) {
			ret.push(`<dim>(${ formatDuration(this.timeTaken) })</dim>`);
		}

		ret = ret.join(" ");

		return o?.format === "rich" ? ret : stripFormatting(ret);
	}

	/**
	 * Get a summary of console messages intercepted during the test run.
	 * @param {object} [o] Options
	 * @param {"rich" | "plain"} [o.format="rich"] Format to use for output. Defaults to "rich".
	 * @returns {string}
	 */
	getMessages (o = {}) {
		let ret = new String("<c yellow><b><i>(Messages)</i></b></c>");
		ret.children = this.messages.map(m => `<dim>(${ m.method })</dim> ${ m.args.join(" ") }`);

		return o?.format === "rich" ? ret : stripFormatting(ret);
	}

	toString (o) {
		let ret = [];

		if (this.test.isGroup) {
			ret.push(this.getSummary(o));
		}
		else if (this.pass === false || this.messages?.length > 0 || o?.verbose) {
			ret.push(this.getResult(o));
		}

		ret = ret.join("\n");

		if (this.tests || this.messages) {
			ret = new String(ret);

			if (this.tests) {
				ret.children = this.tests.filter(t => t.stats.fail + t.stats.pending + t.stats.skipped + t.stats.messages > 0)
				                     .flatMap(t => t.toString(o)).filter(Boolean);
			}

			if (this.messages?.length > 0) {
				(ret.children ??= []).push(this.getMessages(o));
			}

			if (ret.children?.length > 0 || ret.messages?.length > 0) {
				ret.collapsed = this.collapsed;
				ret.highlighted = this.highlighted;
			}
		}

		return ret;
	}

	static warn (...args) {
		console.warn("[hTest result]", ...args);
	}
}
