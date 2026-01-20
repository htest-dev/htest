export default {
	name: "Headless (Chromium)",
	defaultOptions: {
		browser: "chromium",
		headless: true,
	},
	async run () {
		throw new Error("Headless runner is not implemented yet.");
	},
};
