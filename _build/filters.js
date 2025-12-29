import * as path from "node:path";

export function relative (page) {
	if (!page.url) {
		return "";
	}

	let pagePath = page.url.replace(/[^/]+$/, "");
	let ret = path.relative(pagePath, "/");

	return ret || ".";
}

export function safeDump (o) {
	var cache = new WeakSet();

	return JSON.stringify(o, (key, value) => {
		if (typeof value === "object" && value !== null) {
			// No circular reference found

			if (cache.has(value)) {
				return; // Circular reference found!
			}

			cache.add(value);
		}

		return value;
	}, "\t");
}
