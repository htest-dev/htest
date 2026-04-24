import format from "../util/format-console.js";

function printTree (str, parent) {
	if (str.children?.length > 0) {
		console["group" + (parent ? "Collapsed" : "")](...format(str, { css: true }));
		for (let child of str.children) {
			printTree(child, str);
		}
		console.groupEnd();
	}
	else {
		console.log(...format(str, { css: true }));
	}
}

/**
 * Environment-agnostic env that prints results in the console (without depending on terminal-specific things)
 */
export default {
	name: "Console",
	resolveLocation (test) {
		return import(test).then(m => m.default ?? m);
	},
	finish (result, options, event) {
		let str = result.toString({ format: options.format ?? "rich" });
		printTree(str);
	},
};
