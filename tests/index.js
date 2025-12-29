import fs from "node:fs";

// Read filenames in this directory
const __dirname = new URL(".", import.meta.url).pathname;
let filenames = fs.readdirSync(__dirname)
	.filter(name => !name.startsWith("index") && name.endsWith(".js"));

let tests = await Promise.all(filenames.map(name => import(`./${name}`).then(module => module.default)));

let root = {
	name: "All tests",
	tests,
};

export default root;
