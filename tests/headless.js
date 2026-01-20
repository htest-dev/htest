export default {
	name: "Headless runner tests",
	tests: [
		{
			name: "Simple math",
			args: [1, 41],
			run: (a, b) => a + b,
			expect: 42,
		},
		{
			name: "DOM APIs",
			run: () => {
				let div = document.createElement("div");
				div.textContent = "Headless runner works!";
				document.body.append(div);
				return getComputedStyle(div).display;
			},
			expect: "block",
		},
		{
			name: "Hang test",
			run: () => new Promise(() => {}),
			skip: true,
		},
	],
};
