import format, {
	stripFormatting,
	detectMode,
} from "../src/util/format-console.js";

// Escape ANSI escape codes so failure output shows them as visible characters.
// Mirrors previous convention in this file — avoids `map`, which would display
// unmapped raw values alongside, creating unreadable diffs.
function escape (str) {
	return str.replaceAll("\x1b", "\\x1b");
}

export default {
	name: "format-console",
	tests: [
		{
			name: "format()",
			run (arg) {
				let result = format(arg, { ...(this.data ?? {}) });
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
							expect: "\\x1b[1mx\\x1b[0m",
						},
						{
							name: "Semantic token",
							arg: "<c pass>x</c>",
							expect: "\\x1b[38;2;74;222;128mx\\x1b[0m",
						},
						{
							name: "Hex literal",
							arg: "<c #ff0000>x</c>",
							expect: "\\x1b[38;2;255;0;0mx\\x1b[0m",
						},
						{
							name: "Background",
							arg: "<bg pass>x</bg>",
							expect: "\\x1b[48;2;74;222;128mx\\x1b[0m",
						},
						{
							name: "Nested preserves outer",
							arg: "<c pass><c fail>x</c>y</c>",
							expect:
								"\\x1b[38;2;74;222;128m\\x1b[38;2;243;139;168mx\\x1b[0m\\x1b[38;2;74;222;128my\\x1b[0m",
						},
						{
							name: "Diff-style",
							arg: "<bg gutter> <c diff-added>+ added</c> <c diff-removed>- removed</c></bg>",
							expect:
								"\\x1b[48;2;49;50;68m \\x1b[38;2;46;75;58m+ added\\x1b[0m\\x1b[48;2;49;50;68m \\x1b[38;2;75;46;56m- removed\\x1b[0m\\x1b[48;2;49;50;68m\\x1b[0m",
						},
						{
							name: "Unknown color ignored",
							arg: "<c nope>x</c>",
							expect: "x\\x1b[0m",
						},
					],
				},
				{
					name: "256",
					data: { mode: "256" },
					tests: [
						{
							name: "Semantic token (pass → #4ade80 → index 78)",
							arg: "<c pass>x</c>",
							expect: "\\x1b[38;5;78mx\\x1b[0m",
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
							name: "Colors stripped, modifiers kept",
							arg: "<b><c pass>x</c></b>",
							expect: "\\x1b[1mx\\x1b[0m\\x1b[1m\\x1b[0m",
						},
					],
				},
				{
					name: "CSS",
					data: { css: true },
					tests: [
						{
							name: "Single foreground",
							arg: "<c pass>x</c>",
							expect: ["%cx%c", "color:#4ade80", ""],
						},
						{
							name: "Nested foreground",
							arg: "<c pass><c fail>x</c></c>",
							expect: [
								"%c%cx%c%c",
								"color:#4ade80",
								"color:#f38ba8",
								"color:#4ade80",
								"",
							],
						},
						{
							name: "Background plus bold",
							arg: "<b><bg pass>x</bg></b>",
							expect: [
								"%c%cx%c%c",
								"font-weight:bold",
								"font-weight:bold;background:#4ade80",
								"font-weight:bold",
								"",
							],
						},
						{
							name: "Diff-style",
							arg: "<bg gutter> <c diff-added>+ added</c> <c diff-removed>- removed</c></bg>",
							expect: [
								"%c %c+ added%c %c- removed%c%c",
								"background:#313244",
								"color:#2e4b3a;background:#313244",
								"background:#313244",
								"color:#4b2e38;background:#313244",
								"background:#313244",
								"",
							],
						},
					],
				},
			],
		},
		{
			name: "detectMode()",
			run: detectMode,
			tests: [
				{
					name: "NO_COLOR wins over FORCE_COLOR",
					arg: { NO_COLOR: "1", FORCE_COLOR: "3" },
					expect: "strip",
				},
				{
					name: "FORCE_COLOR=3",
					arg: { FORCE_COLOR: "3" },
					expect: "truecolor",
				},
				{ name: "FORCE_COLOR=0", arg: { FORCE_COLOR: "0" }, expect: "strip" },
				{
					name: "COLORTERM",
					arg: { COLORTERM: "truecolor" },
					expect: "truecolor",
				},
				{
					name: "TERM pattern",
					arg: { TERM: "xterm-truecolor" },
					expect: "truecolor",
				},
				{ name: "Default fallback", arg: {}, expect: "256" },
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
