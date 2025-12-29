import markdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import markdownItAttrs from "markdown-it-attrs";
import pluginTOC from "eleventy-plugin-toc";
import eleventyNavigationPlugin from "@11ty/eleventy-navigation";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import * as filters from "./filters.js";

export default eleventyConfig => {
	let data = {
		"layout": "page.njk",
		"permalink": "{{ page.filePathStem | replace('README', 'index') }}.html",
	};

	for (let p in data) {
		eleventyConfig.addGlobalData(p, data[p]);
	}

	eleventyConfig.setDataDeepMerge(true);

	eleventyConfig.setLibrary("md", markdownIt({
		html: true,
	})
		.disable("code")
		.use(markdownItAttrs)
		.use(anchor, {
			permalink: anchor.permalink.headerLink(),
		}),
	);

	for (let f in filters) {
		eleventyConfig.addFilter(f, filters[f]);
	}

	eleventyConfig.addPlugin(eleventyNavigationPlugin);
	eleventyConfig.addPlugin(pluginTOC);

	return {
		markdownTemplateEngine: "njk",
		templateFormats: ["md", "njk"],
		dir: {
			output: ".",
		},
	};
};
