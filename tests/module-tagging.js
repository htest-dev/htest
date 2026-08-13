import Test from "../src/classes/Test.js";
import data from "./fixtures/plain-module.js";

export default {
	name: "Module tagging",
	tests: [
		{
			name: "Non-test modules are left untouched",
			description:
				"The Node env tags every loaded module with its source file. Data modules must not be mutated: a `file` key would shadow a real one and leak into Object.keys().",
			run: () => Object.keys(data),
			expect: ["a"],
		},
		{
			name: "Tests get their file from the registry",
			description: "Source file metadata reaches the Test instance without touching the spec.",
			run () {
				let spec = { name: "Tagged" };
				Test.files.set(spec, { label: "tagged.js", path: "file:///tagged.js" });
				let test = new Test(spec);

				return [test.file?.label, "file" in spec];
			},
			expect: ["tagged.js", false],
		},
	],
};
