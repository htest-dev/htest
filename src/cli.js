#!/usr/bin/env node
import path from "node:path";
import { globSync } from "glob";
import env from "./env/node.js";
import run from "./run.js";

const CONFIG_GLOB = "{,_,.}htest.{json,config.json,config.js}";
let config;


export async function getConfig (glob = CONFIG_GLOB) {
	if (config) {
		return config;
	}

	let paths = globSync(glob);

	if (paths.length > 0) {
		let configPath = "./" + paths[0];
		let importParams;
		configPath = path.join(process.cwd(), configPath);
					// return import(p).then(m => m.default ?? m);
		if (configPath.endsWith(".json")) {
			importParams = {assert: { type: "json" }, with: { type: "json" }};
		}

		config = await import(configPath, importParams).then(m => config = m.default);

		return config;
	}
}

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
		options = {...config, ...options};
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

	let location = argv[0];

	if (argv[1]) {
		options.path = argv[1];
	}

	run(location, {env, ...options});
}
