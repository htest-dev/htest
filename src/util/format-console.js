/**
 * Format console text with HTML-like tags
 */
// https://stackoverflow.com/a/41407246/90826
let modifiers = {
	reset: "\x1b[0m",
	b:     "\x1b[1m",
	dim:   "\x1b[2m",
	i:     "\x1b[3m",
};

let hues = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

let colors = Object.fromEntries(hues.map((hue, i) => [hue, `\x1b[3${i}m`]));
let bgColors = Object.fromEntries(hues.map((hue, i) => [hue, `\x1b[4${i}m`]));

function getColorCode (hue, {light, bg} = {}) {
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

	if (light) {
		return `\x1b[${ bg ? 10 : 9 }${i}m`;
	}

	return `\x1b[${ light ? "1;" : ""}${ bg ? 4 : 3 }${i}m`;
}

let tags = [
	Object.keys(modifiers).map(tag => `</?${tag}>`),
	`<c\\s+(light)?(${ hues.join("|") })>`, `</c>`,
	`<bg\\s+(light)?(${ hues.join("|") })>`, `</bg>`,
];
let tagRegex = RegExp(tags.flat().join("|"), "gi");

export default function format (str) {
	if (!str) {
		return str;
	}

	str = str + "";
	// Iterate over all regex matches in str
	let active = new Set();
	let colorStack = [];
	let bgStack = [];
	return str.replace(tagRegex, tag => {
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

			let activeColor = colorStack.at(-1);
			let colorModifier = getColorCode(activeColor);
			let activeBg = bgStack.at(-1);
			let bgColorModifier = getColorCode(activeBg, {bg: true});
			return modifiers.reset + [...active].map(name => modifiers[name]).join("") + colorModifier + bgColorModifier;
		}
		else {
			if (name === "c") {
				colorStack.push(color);
				return getColorCode(color);
			}
			else if (name === "bg") {
				bgStack.push(color);
				return getColorCode(color, {bg: true});
			}
			else {
				active.add(name);
				return modifiers[name];
			}
		}
	});
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
