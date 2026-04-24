/**
 * Color palette: base 16 ANSI-named colors + semantic tokens.
 * All values as hex literals (no runtime conversion).
 */

const base = {
	black: "#1e1e2e",
	red: "#f38ba8",
	green: "#4ade80",
	yellow: "#f9e2af",
	blue: "#89b4fa",
	magenta: "#cba6f7",
	cyan: "#94e2d5",
	white: "#cdd6f4",
	lightblack: "#585b70",
	lightred: "#eba0ac",
	lightgreen: "#b5e3a7",
	lightyellow: "#faedc4",
	lightblue: "#a0bff9",
	lightmagenta: "#d4b8f7",
	lightcyan: "#a9e3d3",
	lightwhite: "#e6edf5",
};

const semantic = {
	pass: base.green,
	"pass-tint": base.lightgreen,
	fail: base.red,
	"fail-tint": base.lightred,
	skip: "#a0a8b4",
	"skip-tint": "#c4c9d2",
	message: base.yellow,
	"message-tint": base.lightyellow,
	highlight: base.green,
	text: base.black,
	"diff-added": "#2e4b3a",
	"diff-added-tint": base.lightgreen,
	"diff-removed": "#4b2e38",
	"diff-removed-tint": base.lightred,
	gutter: "#313244",
};

export default { ...base, ...semantic };
