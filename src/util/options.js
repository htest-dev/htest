import { parseArgs as nodeParseArgs } from "node:util";

const USAGE = "Usage: htest [<test-location> [<test-path>]] [options]";

export const USAGE_HINT = `${USAGE}

To get started:
  • Run your tests: htest tests/
  • Create htest.config.js for project defaults
  • See all options: htest --help`;

/**
 * Schema for every CLI-overridable option. Key = CLI flag name = `run()` option key.
 *
 * Pass straight to `parseArgs` — it reads `type`/`short`/`multiple` and ignores the rest.
 * Do NOT add `default` here: parseArgs honors it and would inject the value on every flag-less
 * run, silently overriding config. Runtime defaults live in `src/env/node.js` and `src/run.js`;
 * mention them in `description` if useful for `--help`.
 *
 * Metadata fields consumed by `parseArgs`/`formatHelp` only:
 * - `description` — right-column text in `--help`.
 * - `values: [...]` — enum. Rendered as `<a|b|c>` and enforced (invalid values throw).
 * - `placeholder` — value hint when `values` is absent (e.g. `<path>`).
 *
 * Declaration order = `--help` row order.
 */
const OPTIONS = {
	// Test selection
	location: {
		type: "string",
		placeholder: "<path>",
		description: "Where to find tests: a file, directory, or glob",
	},
	path: {
		type: "string",
		placeholder: "<test-path>",
		description: "Run a single test by its position, e.g. 0/2 (3rd test of the 1st group)",
	},
	only: {
		type: "string",
		multiple: true,
		placeholder: "<id|position>",
		description:
			"Run only the test with this id or at this position. Pass multiple times to combine",
	},

	// Runtime behavior
	ci: {
		type: "boolean",
		description: "CI mode: non-interactive, exits with an error code if any test fails",
	},
	watch: {
		type: "boolean",
		short: "w",
		description: "Re-run tests when test or source files change",
	},
	verbose: {
		type: "boolean",
		short: "V",
		description: "Show all test results, including passing ones",
	},

	// Output
	format: {
		type: "string",
		short: "f",
		values: ["rich", "plain"],
		description: "Output format (default: rich)",
	},
	env: {
		type: "string",
		short: "e",
		values: ["auto", "node", "console"],
		description: "Test environment (default: auto)",
	},

	// Config / setup
	config: {
		type: "string",
		short: "c",
		placeholder: "<path>",
		description: "Load this config file instead of searching for one",
	},
	setup: {
		type: "string",
		short: "s",
		multiple: true,
		placeholder: "<path>",
		description: "Script to run before tests. Pass multiple times to run several",
	},

	// Meta. Note: -v is --version (the widespread default); -V is --verbose. parseArgs is case-sensitive.
	help: {
		type: "boolean",
		short: "h",
		description: "Show this help message",
	},
	version: {
		type: "boolean",
		short: "v",
		description: "Show the version",
	},
};

/**
 * Parse CLI arguments against the OPTIONS schema. Thin superset of `node:util` `parseArgs`:
 * same return shape, plus enum-value validation and a max-positionals cap. All errors carry
 * an `HTEST_*` code and a self-contained, single-sentence message.
 *
 * @param {string[]} argv Arguments to parse (typically `process.argv.slice(2)`).
 * @returns {{ values: object, positionals: string[] }}
 */
export function parseArgs (argv) {
	let result;
	try {
		result = nodeParseArgs({
			args: argv,
			options: OPTIONS,
			allowPositionals: true,
			strict: true,
		});
	}
	catch (err) {
		if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
			let e = new Error(`Unknown option. Run "htest --help" for available options.`);
			e.code = "HTEST_UNKNOWN_OPTION";
			throw e;
		}
		if (err.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE") {
			let e = new Error(`Invalid option value. Run "htest --help" for usage.`);
			e.code = "HTEST_INVALID_OPTION_VALUE";
			throw e;
		}
		throw err;
	}

	for (let [key, value] of Object.entries(result.values)) {
		let values = OPTIONS[key]?.values;
		if (values && !values.includes(value)) {
			let err = new Error(
				`Invalid value for --${key}: ${value}. Expected one of: ${values.join(", ")}.`,
			);
			err.code = "HTEST_INVALID_VALUE";
			throw err;
		}
	}

	if (result.positionals.length > 2) {
		let err = new Error(
			`Too many arguments: ${result.positionals.join(" ")}. Expected at most 2 — a test location and an optional test path.`,
		);
		err.code = "HTEST_TOO_MANY_ARGS";
		throw err;
	}

	return result;
}

/**
 * Merge the precedence layers into one options object.
 * Order (low → high): `config < options < positionals < flags`. Programmatic options sit between
 * config and positionals; positionals beat them both but lose to explicit CLI flags.
 * Pure — no I/O. Any layer may be `undefined`.
 *
 * The `positionals[N] !== undefined` guards avoid creating `location: undefined` / `path: undefined`
 * keys (which would shadow `env.defaultOptions` downstream).
 *
 * @param {object | undefined} config Config-file values (lowest priority).
 * @param {object | undefined} options Programmatic `cli(test, options)` values.
 * @param {string[]} positionals CLI positional arguments — `[0]` fills `location`, `[1]` fills `path`.
 * @param {object} flags CLI flag values from `parseArgs` (highest priority).
 * @returns {object} The merged options object.
 */
export function mergeOptions (config, options, positionals, flags) {
	let merged = { ...config, ...options };
	if (positionals[0] !== undefined) {
		merged.location = positionals[0];
	}
	if (positionals[1] !== undefined) {
		merged.path = positionals[1];
	}
	return { ...merged, ...flags };
}

/**
 * Render the help string from OPTIONS. Each row shows the flag (with short alias if any) and a
 * value hint derived from `values` / `placeholder`.
 *
 * @returns {string}
 */
export function formatHelp () {
	let rows = Object.entries(OPTIONS).map(([key, option]) => {
		let flag = (option.short ? `-${option.short}, ` : "    ") + `--${key}`;
		if (option.type === "string") {
			flag += ` ${option.values ? `<${option.values.join("|")}>` : (option.placeholder ?? "<value>")}`;
		}
		return { flag, description: option.description };
	});

	let width = Math.max(...rows.map(row => row.flag.length));

	return [
		USAGE,
		"",
		"Options:",
		...rows.map(row => `  ${row.flag.padEnd(width)}  ${row.description}`),
	].join("\n");
}

/**
 * Read the package version from package.json.
 * package.json is always shipped by npm regardless of the `files` field, so the relative path
 * resolves in both source-tree and npm-installed layouts.
 *
 * @returns {Promise<string>}
 */
export async function getVersion () {
	let pkg = (await import("../../package.json", { with: { type: "json" } })).default;
	return pkg.version;
}
