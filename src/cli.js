#!/usr/bin/env node
import process from "node:process";
import env from "./env/node.js";
import run from "./run.js";
import { getConfig, loadScripts } from "./config.js";
import { parseArgs, mergeOptions, USAGE_HINT, formatHelp, getVersion } from "./util/options.js";

/**
 * Run tests via the CLI or programmatically.
 *
 * @param {object | string} [test] Test object, array of tests, or location string. When omitted,
 *   the runner resolves a location from CLI positionals, `options.location`, config, or env defaults.
 * @param {object} [options] Programmatic options, merged underneath CLI flags and positionals
 *   but on top of the config file. Same shape as `run()` options.
 */
export default async function cli (test, options = {}) {
	try {
		let { values: flags, positionals } = parseArgs(process.argv.slice(2));

		if (flags.help) {
			console.log(formatHelp());
			return;
		}

		if (flags.version) {
			console.log(await getVersion());
			return;
		}

		let config = await getConfig(flags.config);
		let hasTest = test != null;

		// Bare `htest` (no test, no argv, no config) — nudge instead of running an empty cwd.
		if (!hasTest && process.argv.length <= 2 && !config) {
			console.log(USAGE_HINT);
			return;
		}

		// `run()` accepts a string OR test object/array as its first arg, so a `test`-as-location
		// layer flows through unchanged when nothing else sets it.
		if (hasTest) {
			options = { ...options, location: test };
		}
		let {
			location,
			setup,
			config: _,
			...rest
		} = mergeOptions(config, options, positionals, flags);

		if (setup) {
			await loadScripts(setup);
		}

		run(location, { env, ...rest });
	}
	catch (err) {
		console.error(`[htest] ${err.message}`);
		process.exitCode = 1;
	}
}
