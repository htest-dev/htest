import format, { stripFormatting } from "../src/format-console.js";

// We don't want to use map because it will output unmapped values on fail as well, causing a mess in this very special case
function escape (str) {
	return str.replaceAll("\x1b", "\\x1b");
}

export default {
	name: "Console formatting tests",
	tests: [
		{
			name: "Formatting",
			run (str) {
				return escape(format(str));
			},
			tests: [
				{
					name: "Bold",
					args: "<b>bold</b>",
					expect: "\\x1b[1mbold\\x1b[0m",
				},
				{
					name: "Text color",
					args: "<c red>red</c>",
					expect: "\\x1b[31mred\\x1b[0m",
				},
				{
					name: "Background color",
					args: "<bg red>red</bg>",
					expect: "\\x1b[41mred\\x1b[0m",
				},
				{
					name: "Light color",
					args: "<c lightred>light red</c>",
					expect: "\\x1b[91mlight red\\x1b[0m",
				},
				{
					name: "Light background color",
					args: "<bg lightred>light red</bg>",
					expect: "\\x1b[101mlight red\\x1b[0m",
				},
			],
		},
		{
			name: "CSS formatting",
			run (str) {
				let node = process.versions.node;
				delete process.versions.node;
				let ret = format(str);
				process.versions.node = node;
				return ret;
			},
			tests: [
				{
					name: "Nested modifiers + colors",
					args: "<b><bg green><c white> PASS </c></bg></b>",
					expect: [
						"%c%c%c PASS %c%c%c",
						"font-weight: bold",
						"font-weight: bold; background: green",
						"font-weight: bold; color: white; background: green",
						"font-weight: bold; background: green",
						"font-weight: bold",
						"",
					],
				},
			],
		},
		{
			name: "Strip formatting",
			run: stripFormatting,
			tests: [
				{
					args: "<b>bold</b>",
					expect: "bold",
				},
				{
					name: "Malformed tags",
					args: "bold</b> <c red>red?",
					expect: "bold red?",
				},
			],
		},
	],
};
