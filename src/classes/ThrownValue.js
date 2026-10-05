import { stringify } from "../util.js";

/**
 * A thrown primitive, wrapped so it can be annotated and read like an Error.
 * The original value is on `cause`, and reports show it rather than an Error.
 */
export default class ThrownValue extends Error {
	constructor (value) {
		super(stringify(value), { cause: value });
		// Created where hTest catches the value, so its frames would show hTest, not the throw
		this.stack = this.message;
	}

	toString () {
		return this.message;
	}
}

/**
 * Make a thrown value safe to annotate and to read `.message` and `.stack` from, since anything at
 * all can be thrown. Objects pass through; primitives are wrapped in a `ThrownValue`.
 * @param {*} value
 * @returns {Error | object}
 */
export function asError (value) {
	return Object(value) === value ? value : new ThrownValue(value);
}
