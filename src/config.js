import path from "node:path";
import { pathToFileURL } from "node:url";
import { globSync } from "glob";

const CONFIG_GLOB = "{,_,.}htest.{json,config.json,config.js}";
let config;

/**
 * Load the project's htest config.
 *
 * @param {string} [glob] Glob pattern (a literal file path is a degenerate glob that matches itself).
 *   Throws on no-match when explicit so a typo doesn't get swallowed; silently returns on no-match
 *   for the default discovery pattern (a project just doesn't have a config).
 * @returns {Promise<object | undefined>} The config object, or `undefined` if no config exists.
 */
export async function getConfig (glob = CONFIG_GLOB) {
	if (config) {
		return config;
	}

	let paths = globSync(glob);

	if (paths.length === 0) {
		if (glob !== CONFIG_GLOB) {
			throw new Error(`Config file not found: ${glob}`);
		}
		return;
	}

	let configPath = path.resolve(paths[0]);
	let importParams = configPath.endsWith(".json") ? { with: { type: "json" } } : undefined;
	return (config = (await import(configPath, importParams)).default);
}

export async function loadScripts (scripts) {
	if (!Array.isArray(scripts)) {
		scripts = [scripts];
	}

	scripts = scripts.map(script => (typeof script === "string" ? { src: script } : script));

	for (let { src, loadIf } of scripts) {
		if (loadIf === false) {
			continue;
		}

		await import(pathToFileURL(path.resolve(src)));
	}
}
