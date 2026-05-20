/**
 * Format console text with HTML-like tags
 */
// https://stackoverflow.com/a/41407246/90826
let modifiers = {
	reset: { ansi: "\x1b[0m", css: "" },
	b:     { ansi: "\x1b[1m", css: "font-weight: bold" },
	dim:   { ansi: "\x1b[2m", css: "opacity: 0.6" },
	i:     { ansi: "\x1b[3m", css: "font-style: italic" },
};

let hues = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

let cssLightOverrides = {
	black: "gray",
	red: "lightcoral",
	magenta: "violet",
	white: "whitesmoke",
};

function getColor (hue, {light, bg, mode} = {}) {
	if (!hue) {
		return "";
	}
	if (hue.startsWith("light")) {
		hue = hue.replace("light", "");
		light = true;
	}
	let i = hues.indexOf(hue);

	if (i === -1) {
		return "";
	}

	if (mode === "css") {
		let cssHue = light ? (cssLightOverrides[hue] ?? "light" + hue) : hue;
		return `${ bg ? "background" : "color" }: ${ cssHue }`;
	}

	if (light) {
		return `\x1b[${ bg ? 10 : 9 }${i}m`;
	}

	return `\x1b[${ bg ? 4 : 3 }${i}m`;
}

let tags = [
	Object.keys(modifiers).map(tag => `</?${tag}>`),
	`<c\\s+(light)?(${ hues.join("|") })>`, `</c>`,
	`<bg\\s+(light)?(${ hues.join("|") })>`, `</bg>`,
];
let tagRegex = RegExp(tags.flat().join("|"), "gi");

function getCSS (active, colorStack, bgStack, mode) {
	let parts = [];
	for (let mod of active) {
		parts.push(modifiers[mod].css);
	}
	let fg = getColor(colorStack.at(-1), {mode});
	if (fg) {
		parts.push(fg);
	}
	let bg = getColor(bgStack.at(-1), {bg: true, mode});
	if (bg) {
		parts.push(bg);
	}
	return parts.join("; ");
}

export default function format (str) {
	// Not IS_NODEJS — must re-evaluate at call time so tests can patch process.versions
	let mode = typeof process === "object" && process?.versions?.node ? "ansi" : "css";

	if (!str) {
		return mode === "ansi" ? str : [];
	}

	str = str + "";
	// Iterate over all regex matches in str
	let active = new Set();
	let colorStack = [];
	let bgStack = [];
	let styles = [];
	str = str.replace(tagRegex, tag => {
		let isClosing = tag[1] === "/";
		let name = tag.match(/<\/?(\w+)/)[1];
		let color = tag.match(/<(?:bg|c)\s+(\w+)>/)?.[1];

		if (isClosing) {
			if (name === "c") {
				colorStack.pop();
			}
			else if (name === "bg") {
				bgStack.pop();
			}
			else if (active.has(name)) {
				active.delete(name);
			}
			else {
				// Closing tag for formatting that wasn't active
				return "";
			}

			if (mode === "css") {
				styles.push(getCSS(active, colorStack, bgStack, mode));
				return "%c";
			}

			let activeColor = getColor(colorStack.at(-1), {mode});
			let activeBg = getColor(bgStack.at(-1), {bg: true, mode});
			return modifiers.reset.ansi + [...active].map(name => modifiers[name].ansi).join("") + activeColor + activeBg;
		}
		else {
			if (name === "c") {
				colorStack.push(color);
			}
			else if (name === "bg") {
				bgStack.push(color);
			}
			else {
				active.add(name);
			}

			if (mode === "css") {
				styles.push(getCSS(active, colorStack, bgStack, mode));
				return "%c";
			}

			if (name === "c" || name === "bg") {
				return getColor(color, {bg: name === "bg", mode});
			}

			return modifiers[name].ansi;
		}
	});

	return mode === "css" ? [str, ...styles] : str;
}

export function stripFormatting (str) {
	return str.replace(tagRegex, "");
}

// /**
//  * Platform agnostic console formatting
//  * @param {*} str
//  * @param {*} format
//  */
// export default function format (str, format) {
// 	if (typeof format === "string") {
// 		format = Object.fromEntries(format.split(/\s+/).map(type => [type, true]));
// 	}

// 	for (let type in format) {
// 		str = formats[type] ? formats[type](str) : str;
// 	}
// str = str.replaceAll("\x1b", "\\x1b");
// 	return str;
// }
