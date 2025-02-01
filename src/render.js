/**
 * Render JS-first tests to HTML
 */

import Test from "./classes/Test.js";
import TestResult from "./classes/TestResult.js";
import RefTest from "./html/reftest.js";
import { create, output } from "./html/util.js";
import { formatDuration } from "./util.js";

export default function render (test) {
	let root = new Test(test);

	create("h1", {
		textContent: root.name,
		inside: document.body,
	});

	document.title = root.name;

	let testRows = new Map();

	root.tests?.map?.(t => {
		let tests = t.isGroup ? t.tests : [t];

		let table;
		let section = create("section", {
			contents: [
				{tag: "h1", textContent: t.name},
				t.description && {tag: "p", textContent: t.description},
				table = create({tag: "table", class: "manual reftest",
					contents: tests.flatMap(t2 => t2?.tests ?? t2).map((t2, i) => {
						let tr = t2.render?.() ?? create("tr", {
							title: t2.name,
							contents: [
								{tag: "td", textContent: t2.args?.map(a => output(a)).join(", ") },
								{tag: "td"},
								{tag: "td", textContent: output(t2.expect) },
							],
						});

						if (t2.throws) {
							tr.dataset.error = "";
						}

						testRows.set(t2, tr);
						return tr;
					}),
				}),
			],
			inside: document.body,
		});

		requestAnimationFrame(() => {
			if (!table.reftest) {
				new RefTest(table);
			}
		});

		return section;
	});

	let result = new TestResult(root);

	result.addEventListener("done", e => {
		let target = e.detail.target;

		if (target.test.isTest) {
			let tr = testRows.get(target.test);
			tr.cells[1].textContent = output(target.actual);
			tr.classList.add(target.pass ? "pass" : "fail");
			if (target.test.skip) {
				tr.classList.add("skipped");
			}
			tr.dataset.time = formatDuration(target.timeTaken);
		}
	});

	result.runAll();
}

