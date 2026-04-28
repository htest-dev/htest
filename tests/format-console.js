import format, {
	stripFormatting,
	ansiTruecolor,
	ansi256,
} from "../src/util/format-console.js";
import palette from "../src/util/palette.js";

// Escape ANSI escape codes so failure output shows them as visible characters.
// Mirrors previous convention in this file — avoids `map`, which would display
// unmapped raw values alongside, creating unreadable diffs.
function escape (str) {
	return str.replaceAll("\x1b", "\\x1b");
}

const RESET = "\\x1b[0m";
const color = hex => escape(ansiTruecolor(hex));
const bgColor = hex => escape(ansiTruecolor(hex, { bg: true }));
const color256 = hex => escape(ansi256(hex));

export default {
	name: "format-console",
	tests: [
		{
			name: "format()",
			run (arg) {
				let result = format(arg, this.data?.mode);
				return typeof result === "string" ? escape(result) : result;
			},
			tests: [
				{
					name: "Truecolor",
					data: { mode: "truecolor" },
					tests: [
						{
							name: "Bold modifier",
							arg: "<b>x</b>",
							expect: `\\x1b[1mx${RESET}`,
						},
						{
							name: "Semantic token",
							arg: "<c pass>x</c>",
							expect: `${color(palette.pass)}x${RESET}`,
						},
						{
							name: "Hex literal",
							arg: "<c #ff0000>x</c>",
							expect: "\\x1b[38;2;255;0;0mx\\x1b[0m",
						},
						{
							name: "Background",
							arg: "<bg pass>x</bg>",
							expect: `${bgColor(palette.pass)}x${RESET}`,
						},
						{
							name: "Nested preserves outer",
							arg: "<c pass><c fail>x</c>y</c>",
							expect: `${color(palette.pass)}${color(palette.fail)}x${RESET}${color(palette.pass)}y${RESET}`,
						},
						{
							name: "Diff-style",
							arg: "<bg gutter> <c diff-added>+ added</c> <c diff-removed>- removed</c></bg>",
							expect: `${bgColor(palette.gutter)} ${color(palette["diff-added"])}+ added${RESET}${bgColor(palette.gutter)} ${color(palette["diff-removed"])}- removed${RESET}${bgColor(palette.gutter)}${RESET}`,
						},
						{
							name: "Unknown color ignored",
							arg: "<c nope>x</c>",
							expect: `x${RESET}`,
						},
						{
							name: "Nested unknown preserves outer",
							arg: "<c pass><c nope><b>x</b></c></c>",
							expect: `${color(palette.pass)}\\x1b[1mx${RESET}${color(palette.pass)}${RESET}${color(palette.pass)}${RESET}`,
						},
						{
							name: "3-char hex expansion",
							arg: "<c #f00>x</c>",
							expect: "\\x1b[38;2;255;0;0mx\\x1b[0m",
						},
						{
							name: "Empty string",
							arg: "",
							expect: "",
						},
					],
				},
				{
					name: "256",
					data: { mode: "256" },
					tests: [
						{
							name: "Semantic token via 256 cube",
							arg: "<c pass>x</c>",
							expect: `${color256(palette.pass)}x${RESET}`,
						},
						{
							name: "Hex literal red → index 196",
							arg: "<c #ff0000>x</c>",
							expect: "\\x1b[38;5;196mx\\x1b[0m",
						},
					],
				},
				{
					name: "Strip",
					data: { mode: "strip" },
					tests: [
						{
							name: "Semantic token stripped",
							arg: "<c pass>x</c>",
							expect: `x${RESET}`,
						},
						{
							name: "Hex literal stripped",
							arg: "<c #ff0000>x</c>",
							expect: `x${RESET}`,
						},
						{
							name: "Colors stripped, modifiers kept",
							arg: "<b><c pass>x</c></b>",
							expect: `\\x1b[1mx${RESET}\\x1b[1m${RESET}`,
						},
					],
				},
				{
					name: "CSS",
					data: { mode: "css" },
					tests: [
						{
							name: "Single foreground",
							arg: "<c pass>x</c>",
							expect: ["%cx%c", `color: ${palette.pass}`, ""],
						},
						{
							name: "Nested foreground",
							arg: "<c pass><c fail>x</c></c>",
							expect: [
								"%c%cx%c%c",
								`color: ${palette.pass}`,
								`color: ${palette.fail}`,
								`color: ${palette.pass}`,
								"",
							],
						},
						{
							name: "Background plus bold",
							arg: "<b><bg pass>x</bg></b>",
							expect: [
								"%c%cx%c%c",
								"font-weight: bold",
								`font-weight: bold; background: ${palette.pass}`,
								"font-weight: bold",
								"",
							],
						},
						{
							name: "Diff-style",
							arg: "<bg gutter> <c diff-added>+ added</c> <c diff-removed>- removed</c></bg>",
							expect: [
								"%c %c+ added%c %c- removed%c%c",
								`background: ${palette.gutter}`,
								`color: ${palette["diff-added"]}; background: ${palette.gutter}`,
								`background: ${palette.gutter}`,
								`color: ${palette["diff-removed"]}; background: ${palette.gutter}`,
								`background: ${palette.gutter}`,
								"",
							],
						},
					],
				},
			],
		},
		{
			name: "stripFormatting()",
			run: stripFormatting,
			tests: [
				{ arg: "<b><c pass>x</c></b>", expect: "x" },
				{
					name: "Malformed tags",
					arg: "bold</b> <c pass>x?",
					expect: "bold x?",
				},
			],
		},
	],
};
