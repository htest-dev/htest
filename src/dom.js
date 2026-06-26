import { delay, getType, stringify } from "./util.js";
export { default as create } from "https://v2.blissfuljs.com/src/dom/create.js";
export { default as bind } from "https://v2.blissfuljs.com/src/events/bind.js";
export { default as include } from "https://v2.blissfuljs.com/src/async/include.js";

/**
 * Parse data-click text into a meaningful structure.
 * @example
 * .foo .bar wait 5s after load
 * @example
 * .foo .bar wait 3s (no event, DOMContentLoaded assumed)
 * @example
 * wait 1s after load (no selector, element assumed)
 */
export function parseClick (click) {
	var ret = { times: 1 };

	click = click.replace(/wait ([\d.]+)s/i, ($0, $1) => {
		ret.delay = $1 * 1000;
		return "";
	});

	click = click.replace(/after ([\w:-]+)\s*$/i, ($0, $1) => {
		ret.event = $1;
		return "";
	});

	click = click.replace(/(\d+) times/i, ($0, $1) => {
		ret.times = $1;
		return "";
	});

	ret.selector = click.trim();

	return ret;
}

export async function doClick (click, target) {
	click = parseClick(click);

	if (click.event) {
		await new Promise(resolve => target.addEventListener(click.event, resolve, { once: true }));
	}

	if (click.delay) {
		await delay(click.delay);
	}

	let targets = click.selector ? $$(click.selector, target) : [target];

	for (let target of targets) {
		for (let i = 0; i < click.times; i++) {
			target.click();
		}
	}
}

export function $$ (selector, context = document) {
	return [...context.querySelectorAll(selector)];
}

export function ready (doc = document) {
	return new Promise(resolve => {
		if (doc.readyState !== "loading") {
			resolve();
		}
		else {
			doc.addEventListener("DOMContentLoaded", resolve, { once: true });
		}
	});
}

export function output (obj) {
	return stringify(obj, {
		custom: obj => {
			if (Array.isArray(obj)) {
				return obj.map(output).join(", ");
			}

			if (typeof obj === "string") {
				return obj;
			}

			// Handle nested objects
			if (obj && typeof obj === "object") {
				let entries = Object.entries(obj).map(([key, value]) => `${key}: ${output(value)}`);
				return "{ " + entries.join(", ") + " }";
			}
		},
	});
}
