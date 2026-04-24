/**
 * Color palette: base 16 ANSI-named colors + semantic tokens.
 * Dark-optimized. All values as hex literals (no runtime conversion).
 */

const base = {
	black:        "#1e1e2e",
	red:          "#f38ba8",
	green:        "#a6e3a1",
	yellow:       "#f9e2af",
	blue:         "#89b4fa",
	magenta:      "#cba6f7",
	cyan:         "#94e2d5",
	white:        "#cdd6f4",
	lightblack:   "#585b70",
	lightred:     "#eba0ac",
	lightgreen:   "#b5e3a7",
	lightyellow:  "#faedc4",
	lightblue:    "#a0bff9",
	lightmagenta: "#d4b8f7",
	lightcyan:    "#a9e3d3",
	lightwhite:   "#e6edf5",
};

const semantic = {
	pass:           base.green,
	fail:           base.red,
	skip:           "#7d8590",
	message:        base.yellow,
	highlight:      base.green,
	text:           base.lightwhite,
	"diff-added":   "#2e4b3a",
	"diff-removed": "#4b2e38",
	gutter:         "#313244",
};

export default { ...base, ...semantic };
