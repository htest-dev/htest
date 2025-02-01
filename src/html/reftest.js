import { doClick, create, $$, bind, ready } from "./util.js";
import { formatDuration } from "../util.js";
import hooks from "../hooks.js";
import * as compare from "./compare.js";

export default class RefTest {
	constructor (table) {
		this.table = table;
		table.reftest = this;
		this.columns = +this.table.getAttribute("data-columns") || Math.max.apply(Math, [...this.table.rows].map(row => row.cells.length));
		this.manual = this.table.matches(".manual");
		this.init();
	}

	async init () {
		this.compare = this.manual ? null : await RefTest.getTest(this.table.getAttribute("data-test"));
		this.setup();

		if (!this.manual) {
			this.startup = performance.now();
			this.test();
		}
	}

	setup () {
		if (this.table.rows.length === 0) {
			console.warn("Empty reftest:", this.table);
			return;
		}

		// Add table header if not present
		if (!this.table.querySelector("thead") && this.columns > 1) {
			var header = [...Array(Math.max(0, this.columns - 2)).fill("Test"), "Actual", "Expected"].slice(-this.columns);

			create("thead", {
				contents: [
					{
						tag: "tr",
						contents: header.map(text => {
							return {tag: "th", textContent: text};
						}),
					},
				],
				start: this.table,
			});
		}

		// Observe class changes on <tr>s and update the results
		this.resultObserver = new MutationObserver(mutation => {
			for (let {target} of mutation) {
				if (target.matches("tr")) {
					RefTest.updateResults();
				}
			}
		});

		this.resultObserver.observe(this.table, {
			subtree: true,
			attributes: true,
			attributeFilter: ["class"],
		});

		if (!this.manual) {
			let test = x => {
				requestAnimationFrame(() => this.test());
			};

			this.observer = new MutationObserver(test);
			this.observe();

			bind(this.table, "input change click mv-change", test);

			this.table.closest("[mv-app]")?.addEventListener("mv-load", test);

			$$("[data-click]", this.table)
				.concat(this.table.matches("[data-click]") ? [this.table] : [])
				.forEach(target => {
					target.getAttribute("data-click").trim().split(/\s*,\s*/).forEach(doClick);
				});
		}

		ready().then(() => RefTest.updateResults());
	}

	observe () {
		this.observerRunning = true;

		this.observer.observe(this.table, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
			// TODO move this somewhere else, it's Mavo specific
			attributeFilter: ["mv-mode"],
		});
	}

	unobserve () {
		this.observer.disconnect();
		this.observerRunning = false;
	}

	// Run code past observer
	sneak (callback) {
		this.unobserve();
		var ret = callback.call(this);
		this.observe();
		return ret;
	}

	test () {
		hooks.run("reftest-test", this);

		for (let tr of this.table.rows) {
			if (!this.table.tHead || tr !== this.table.tHead.rows[0]) {
				this.testRow(tr);
			}
		}
	}

	async testRow (tr) {
		let env = {context: this, tr, cells: [...tr.cells]};
		hooks.run("reftest-testrow", env);

		if (!env.tr.compare) {
			env.tr.compare = await RefTest.getTest(env.tr.getAttribute("data-test"), this.compare);
		}

		let resultCell = env.tr.cells[env.tr.cells.length - 1];

		if (env.cells.length) {
			if (this.columns == 3) {
				// Test, actual, expected
				if (env.cells.length == 1) {
					// expected is the same as test
					resultCell = create("td", {after: env.cells[0]});
					env.cells.push(resultCell);
				}

				if (env.cells.length == 2) {
					// missing actual
					resultCell = create("td", {after: env.cells[0]});
					env.cells.splice(1, 0, resultCell);
				}

				if (!env.cells[2].textContent) {
					env.cells[2].textContent = env.cells[0].textContent;
				}
			}
			else if (this.columns == 2 && !env.cells[0].innerHTML) {
				// Empty cell, takes the test from above
				let previous = env.tr;
				while (previous = previous.previousElementSibling) {
					if (previous.cells[0].innerHTML) {
						env.cells[0] = previous.cells[0];
						break;
					}
				}
			}

			try {
				var ret = this.sneak(() => tr.compare(...env.cells));
				resultCell.onclick = null;
			}
			catch (e) {
				ret = e;
				var error = true;
				resultCell.textContent = e + "";
				resultCell.onclick = evt => console.error(e);
			}

			var error = ret instanceof Error;

			var previousClass = tr.classList.contains("pass") ? "pass" : "fail";
			tr.classList.remove("pass", "fail");
			let pass = ret;
			if (error) {
				pass = tr.hasAttribute("data-error");
			}

			var className = pass ? "pass" : "fail";
			tr.classList.add(className);

			if (className == "pass" && className != previousClass && !tr.classList.contains("interactive")) {
				// Display how long it took
				let time = performance.now() - this.startup;
				tr.setAttribute("data-time", formatDuration(time));
			}
		}
	}

	static hooks = hooks;

	// Retrieve the comparator function based on a data-test string
	static async getTest (test, fallback) {
		if (test) {
			if (test in this.compare) {
				return this.compare[test];
			}
			else {
				if (test in globalThis) {
					return globalThis[test];
				}
				else {
					// return new Function("td", "ref", test);
					// Try again in a bit
					await new Promise(resolve => window.addEventListener("load", resolve, {once: true}));
					return globalThis[test];
				}
			}
		}

		return fallback || RefTest.compare.contents;
	}

	// Default comparison functions
	static compare = compare;

	// Prettify code for presentation
	// TODO just use Prism whitespace plugin
	static presentCode (code) {
		// Remove blank line in the beginning and end
		code = code.replace(/^\s*\n|\n\s*$/g, "");

		// Remove extra indentation
		var indent = (code.match(/^\s*/) || [""])[0];
		code = code.replace(RegExp("^" + indent, "gm"), "");

		code = code.replace(/document.write/g, "print");

		return code;
	}

	static updateResults () {
		this.results = {
			pass: $$("table.reftest:not(.skipped) tr.pass:not(.skipped)"),
			fail: $$("table.reftest:not(.skipped) tr.fail:not(.skipped)"),
			skipped: $$("table.reftest tr.skipped"),
			current: {
				pass: -1,
				fail: -1,
				skipped: -1,
			},
			// interactive: $$("table.reftest tr.interactive")
		};

		let detail = {
			pass: this.results.pass.length,
			fail: this.results.fail.length,
			skipped: this.results.skipped.length,
		};

		document.body.style.setProperty("--pass", detail.pass);
		document.body.style.setProperty("--fail", detail.fail);
		document.body.style.setProperty("--skipped", detail.skipped);

		document.body.classList.toggle("no-passed", detail.pass === 0);
		document.body.classList.toggle("no-failed", detail.fail === 0);
		document.body.classList.toggle("no-skipped", detail.skipped === 0);
		// $(".count-interactive", RefTest.nav).textContent = RefTest.results.interactive.length;

		document.dispatchEvent(new CustomEvent("testresultsupdate", {detail}));
	}

	// Navigate tests
	static #navigateTests (type = "fail", offset) {
		let elements = this.results[type];
		let i = this.results.current[type] + offset;

		if (!elements.length) {
			return;
		}

		if (i >= elements.length) {
			i = 0;
		}
		else if (i < 0) {
			i = elements.length - 1;
		}

		if (elements.length > 1) {
			let countElement = RefTest.nav.querySelector(".count-" + type);
			countElement.querySelector(".nav").hidden = false;
			countElement.querySelector(".current").textContent = i + 1;
		}

		elements[i].scrollIntoView({behavior: "smooth"});

		this.results.current[type] = i;
	}

	static next (type = "fail") {
		this.#navigateTests(type, 1);
	}

	static previous (type = "fail") {
		this.#navigateTests(type, -1);
	}
}
