import { create, $$ } from "./util.js";

/**
 * Code for test homepage
 */

function runSelected (names) {
	iframes.innerHTML = "";

	let tests = names.map(name => {
		return create("iframe", {
			inside: iframes,
			src: name,
			events: {
				load: evt => {
					updateTotals();

					evt.target.contentWindow.document.addEventListener("testresultsupdate", evt => {
						updateTotals();
					});
				},
			},
		});
	});

	function updateTotals () {
		let totals = {pass: 0, fail: 0, skipped: 0};

		tests.forEach(iframe => {
			let doc = iframe.contentDocument;

			if (doc.readyState !== "complete" || !doc.querySelector("body > nav")) {
				return;
			}

			totals.pass += +doc.body.style.getPropertyValue("--pass");
			totals.fail += +doc.body.style.getPropertyValue("--fail");
			totals.skipped += +doc.body.style.getPropertyValue("--skipped");
		});

		let totalsEl = document.querySelector("h1 + .totals") || create({className: "totals", after: document.querySelector("h1")});

		totalsEl.innerHTML = `<strong>${totals.pass}</strong> passing, <strong>${totals.fail}</strong> failing, <strong>${totals.skipped}</strong> skipped of ${totals.pass + totals.fail + totals.skipped} total`;
	}
}

// tests is the <ul id="tests"> that contains the list of tests
for (let a of tests.querySelectorAll("li > a")) {
	let li = a.parentElement;
	a.insertAdjacentHTML("beforebegin", `<input type="checkbox" property="toRun" checked>`);
	a.insertAdjacentHTML("afterend", `<a href="${ a.getAttribute("href") }" class="new-tab" title="Open in new Tab" target="_blank">↗️</a>`);

	a.target = "test";
	li.addEventListener("click", evt => {
		if (evt.target.matches("a")) {
			for (let li of tests.querySelectorAll("li")) {
				li.classList.remove("selected");
			}
			li.classList.add("selected");
			iframes.textContent = "";
		}
		else if (evt.target.matches("input[type=checkbox]")) {
			let checked = $$("input[type=checkbox]:not(#select_all)", tests).map(checkbox => checkbox.checked);
			let includesTrue = checked.includes(true);
			let includesFalse = checked.includes(false);
			select_all.indeterminate = includesTrue && includesFalse;
			select_all.checked = includesTrue;
		}
	});
}

tests.insertAdjacentHTML("afterbegin", `<li>
<label>
	<input type="checkbox" id="select_all" checked>
	Select/unselect all
</label>
</li>`);
tests.insertAdjacentHTML("afterend", `<button id="run_button">Run selected</button>`);

select_all.addEventListener("click", evt => {
	let checked = evt.target.checked;
	for (let checkbox of $$("input[type=checkbox]:not(#select_all)", tests)) {
		checkbox.checked = checked;
	}
});

run_button.addEventListener("click", evt => {
	runSelected($$("li > :checked + a", tests).map(a => a.getAttribute("href")));
});

document.body.insertAdjacentHTML("beforeend", `<div id="iframes"></div>
<iframe name="test" src="about:blank"></iframe>`);
