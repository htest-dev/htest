#!/usr/bin/env node
import env from "./env/node.js";
import run from "./run.js";
import { getConfig, loadScripts } from "./config.js";

/**
 * Run tests via a CLI command
 * First argument is the location to look for tests (defaults to the current directory)
 * Second argument is the test path (optional)
 *
 * Supported flags:
 * --ci         Run in continuous integration mode (disables interactive features)
 * --verbose    Verbose output (show all tests, not just failed, skipped, or tests with intercepted console messages)
 *
 * @param {object} [options] Same as `run()` options, but command line arguments take precedence
 */
export default async function cli (options = {}) {
	let config = await getConfig();
	if (config) {
		options = { ...config, ...options };
	}

	let argv = process.argv.slice(2);

	const flags = ["ci", "verbose"];
	for (let flag of flags) {
		let flagIndex = argv.indexOf("--" + flag);
		if (flagIndex !== -1) {
			argv.splice(flagIndex, 1); // remove the flag from args
			options[flag] = true;
		}
	}

	if (options.setup) {
		await loadScripts(options.setup);
		delete options.setup;
	}

	let location = argv[0];

	if (argv[1]) {
		options.path = argv[1];
	}

	run(location, { env, ...options });
}
