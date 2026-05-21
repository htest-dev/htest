import path from "node:path";
import { pathToFileURL } from "node:url";
import { globSync } from "glob";

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
		if (configPath.endsWith(".json")) {
			importParams = {assert: { type: "json" }, with: { type: "json" }};
		}

		config = await import(configPath, importParams).then(m => config = m.default);

		return config;
	}
}

export function normalizeScripts (scripts) {
	if (!Array.isArray(scripts)) {
		scripts = [scripts];
	}

	return scripts.map(entry => typeof entry === "string" ? { src: entry } : entry);
}

export async function loadScripts (scripts) {
	let entries = normalizeScripts(scripts);

	for (let { src, loadIf } of entries) {
		if (loadIf === false) {
			continue;
		}

		await import(pathToFileURL(path.resolve(src)));
	}
}
