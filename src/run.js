/**
 * Environment agnostic function for running one or more tests.
 */

import Test from "./classes/Test.js";
import TestResult from "./classes/TestResult.js";
import { getType, subsetTests } from "./util.js";

/**
 * Run a test or group of tests
 * @param {Test | object} test
 * @param {object} [options]
 * @param {"rich" | "plain"} [options.format] Format to use for output. Defaults to "rich"
 * @param {object | string} [options.env="auto"] Environment-specific params.
 * Either an object like those in `src/env/` or a string (`"auto"`, `"node"`, `"console"`)
 */
export default function run (test, options = {}) {
	if (!options.env) {
		options.env = "auto";
	}

	if (typeof options.env === "string") {
		import(`./env/${ options.env }.js`)
			.then(m => run(test, {...options, env: m.default}))
			.catch(err => {
				console.error(`Error importing environment ${options.env}`, err);
			});
		return;
	}

	let env = options.env;

	if (env.defaultOptions) {
		options = Object.assign({}, env.defaultOptions, options);
	}

	if (!test) {
		test ??= options.location;
	}

	if (env.setup) {
		env.setup();
	}

	if (env.run) {
		return env.run(test, options);
	}

	if (getType(test) == "string") {
		if (env.resolveLocation) {
			env.resolveLocation(test).then(tests => {
				run(tests, options);
			});
			return;
		}
		else {
			throw new Error(`Cannot resolve string specifiers in env ${env.name}`);
		}
	}

	if (Array.isArray(test)) {
		if (test.length === 1) {
			test = test[0];
		}
		else {
			return run({tests: test}, options);
		}
	}

	if (!test || test.tests?.length === 0) {
		Test.warn("No tests found" + (options.location ? " in " + options.location : ""));
		return;
	}

	if (options.path) {
		subsetTests(test, options.path);

		if (!test || test.tests?.length === 0) {
			Test.warn(`Path ${options.path} produced no tests.`);
			return;
		}
	}

	if (!(test instanceof Test)) {
		test = new Test(test, null, options);
	}

	let ret = new TestResult(test, null, options);

	let hooks = ["start", "done", "finish"];
	for (let hook of hooks) {
		let fn = options[hook] ?? env[hook];
		if (fn) {
			ret.addEventListener(hook, function (evt) {
				let target = evt.detail?.target ?? evt.target ?? ret;
				fn(target, options, evt, ret);
			});
		}
	}

	return ret.runAll();
}
