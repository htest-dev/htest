import { normalizeScripts } from "../src/config.js";

export default {
	name: "normalizeScripts()",
	run: normalizeScripts,
	tests: [
		{
			name: "String input",
			arg: "polyfill.js",
			expect: [{ src: "polyfill.js" }],
		},
		{
			name: "Object input",
			arg: { src: "a.js", loadIf: false },
			expect: [{ src: "a.js", loadIf: false }],
		},
		{
			name: "Array input",
			arg: ["a.js", "b.js"],
			expect: [{ src: "a.js" }, { src: "b.js" }],
		},
	],
};
