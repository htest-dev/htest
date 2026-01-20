// FIXME: Importing TestResult here pulls in the browser diff CDN dependency.
// We don't do diffing in the headless environment, so we need to find a way to avoid importing the diff package in TestResult.js.
import TestResult from "./classes/TestResult.js";
import { stringify } from "./util.js";

export function serializeError (error) {
	if (!error) {
		return null;
	}

	return {
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
}

export function serializeTest (test) {
	if (!test) {
		return null;
	}

	return {
		name: test.name,
		id: test.id,
		level: test.level,
		isGroup: test.isGroup,
		isTest: test.isTest,
		skip: test.skip,
		description: test.description,
		maxTime: test.maxTime,
		maxTimeAsync: test.maxTimeAsync,
		throws: test.throws,
	};
}

export function serializeResult (result) {
	return {
		test: serializeTest(result.test),
		pass: result.pass,
		skipped: result.skipped,
		details: result.details ?? [],
		error: serializeError(result.error),
		timeTaken: result.timeTaken ?? 0,
		timeTakenAsync: result.timeTakenAsync ?? 0,
		stats: result.stats ?? null,
		messages: (result.messages ?? []).map(m => ({
			method: m.method,
			args: (m.args ?? []).map(arg => stringify(arg)),
			stringified: true,
		})),
		children: (result.tests ?? []).map(child => serializeResult(child)),
	};
}

export function deserializeError (payload) {
	if (!payload) {
		return null;
	}

	let err = new Error(payload.message);
	err.name = payload.name;
	err.stack = payload.stack;
	return err;
}

export function deserializeResult (json, options = {}, parent = null) {
	let result = new TestResult(json.test ?? {}, parent, options);

	result.pass = json.pass;
	result.skipped = json.skipped;
	result.details = json.details ?? [];
	result.error = deserializeError(json.error);
	result.timeTaken = json.timeTaken ?? 0;
	result.timeTakenAsync = json.timeTakenAsync ?? 0;
	result.stats = json.stats ?? result.stats ?? {};
	result.messages = json.messages ?? [];
	result.tests = (json.children ?? []).map(child => deserializeResult(child, options, result));

	return result;
}
