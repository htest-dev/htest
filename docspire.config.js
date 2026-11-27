import landing from "docspire/plugins/landing";
import theme, { site } from "./docspire/index.js";

export default {
	...site,
	import: {
		"README.md": "index.md",
		"SKILL.md": "skill.md",
	},
	plugins: [
		landing,
		theme,
		{
			url: import.meta.url,
			plugin (config) {
				config.addPassthroughCopy("_headers");
				config.addPassthroughCopy("_redirects");
				config.addPassthroughCopy("SKILL.md");

				// Public URLs that pages written with hTest load, e.g. https://htest.dev/src/render.js
				config.addPassthroughCopy("htest.js");
				config.addPassthroughCopy("htest.css");
				config.addPassthroughCopy("src");

				// Built by TypeDoc (npm run build:docs) before Docspire runs
				config.addPassthroughCopy("api");
			},
		},
	],
};
