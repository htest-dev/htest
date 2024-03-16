import logUpdate from 'log-update';
import { AsciiTree } from 'oo-ascii-tree';
import { globSync } from 'glob';
import path from 'path';

import genericRun from "../run.js";
import Test from "../classes/Test.js";
import format from "../format-console.js";
import { getType } from '../util.js';

// Set up environment for Node
function getTree (msg, i) {
	return new AsciiTree(`</dim>${ msg }<dim>`, ...(msg.children?.map(getTree) ?? []));
}

export const env = {
	done: result => {
		let messages = result.toString({ format: options.format ?? "rich" });
		let tree = getTree(messages).toString();
		tree = format(tree);
		logUpdate(tree);

		if (ret.stats.pending === 0) {
			logUpdate.clear();
			console.log(tree);
		}
	}
}

/**
 * Run a test or group of tests in Node.js
 * @param {Test | object} test
 * @param {object} [options]
 * @param {"rich" | "plain"} [options.format] Format to use for output. Defaults to "rich"
 * @param {function} [options.finished] Callback to run when all tests are finished
 */
export default function run (test, options = {}) {
	process.env.NODE_ENV = "test";

	if (getType(test) == "string") {
		// Glob provided, resolve to test(s)
		Promise.all(globSync(test).flatMap(paths => {
			// Convert paths to imported modules
			paths = getType(paths) == "string" ? [paths] : paths;
			return paths.map(p => {
				p = path.join(process.cwd(), p);
				return import(p).then(m => m.default ?? m);
			});
		})).then(tests => {
			genericRun(tests, options);
		});
		return;
	}

	options.env = env;

	return genericRun(test, options);
}