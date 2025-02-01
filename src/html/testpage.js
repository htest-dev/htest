import { idify } from "../util.js";
import { create, include, $$, bind, ready } from "./util.js";
import RefTest from "./reftest.js";
import * as Test from "./content.js";

/**
 * Code for page of tests
 */

// Add ids to section headers and make them links
for (let h1 of $$("body > section > h1")) {
	let section = h1.parentNode;

	section.id = section.id || idify(h1.textContent);

	create("a", {
		href: "#" + section.id,
		around: h1.firstChild,
	});
}

Promise.all([
	include(self.Prism, "https://cdnjs.cloudflare.com/ajax/libs/prism/1.8.1/prism.min.js"),
	include(self.tippy, "https://unpkg.com/tippy.js@1/dist/tippy.js"),
])
	.then(() => include(Prism.plugins.NormalizeWhitespace, "https://cdnjs.cloudflare.com/ajax/libs/prism/1.8.1/plugins/normalize-whitespace/prism-normalize-whitespace.min.js"))
	.then(() => {
		var t = tippy(cells, {
			html: td => {
				var pre = create("pre");
				var code = create("code", {
					textContent: cellHTML.get(td),
					className: "language-markup",
					inside: pre,
				});
				Prism.highlightElement(code);

				return pre;
			},
			arrow: true,
			theme: "light",
			maxWidth: "50em",
		});

		t.store.forEach(instance => {
			bind(instance.el, "mouseover mouseenter", function (evt) {
				if (evt.target != this) {
					var popper = t.getPopperElement(this);
					t.hide(popper);
				}
			});
		});
	});

loadCSS("https://cdnjs.cloudflare.com/ajax/libs/prism/1.8.1/themes/prism.css");
loadCSS("https://unpkg.com/tippy.js@1.3.0/dist/tippy.css");


await ready();

// Add ids to all tests
$$(`.reftest > tbody > tr`).forEach((test, i) => {
	if (!test.id) {
		test.id = idify(test.title) || "test-" + (i + 1);
	}
});


let hashchanged = evt => {
	if (location.hash) {
		var target = document.querySelector(location.hash);

		if (!target) {
			return;
		}

		let isSection = target.matches("body > section");
		let isTest = target.matches(".reftest > tbody > tr");

		if (isSection || isTest) {
			if (evt) {
				// Hash was changed manually, reload to resolve properly
				location.reload();
				return true;
			}

			let targetSection = isSection ? target : target.closest("section");
			let targetSectionId = targetSection.id;

			// Isolate this test
			for (let section of $$(`body > section`)) {
				if (section.id !== targetSection.id) {
					section.remove();
				}
			}

			if (isTest) {
				for (let test of $$(`.reftest > tbody > tr`)) {
					if (test.id !== target.id) {
						test.remove();
					}
				}
			}

			create("p", {
				className: "notice",
				contents: [
					"Some tests hidden. ",
					{
						tag: "a",
						href: "#",
						onclick: evt => {
							location.hash = "#";
							location.reload();
						},
						textContent: "Show all tests",
					},
				],
				start: document.body,
			});
		}
	}
};

hashchanged();
window.addEventListener("hashchange", hashchanged);

// Add div for counter at the end of body
let nav = create({
	tag: "nav",
	inside: document.body,
	contents: [
		window === parent ? {
			tag: "a",
			className: "home",
			title: "Home",
			textContent: "🏠",
			href: "index.html",
			target: "_top",
		} : undefined,
		...["fail", "pass", "skipped"].map(type => {
			return {
				className: "count-" + type,
				contents: [
					{className: "count"},
					{
						className: "nav",
						hidden: true,
						contents: [
							{
								tag: "button", type: "button",
								className: "previous", textContent: "◂",
								onclick: evt => {
									RefTest.previous(type);
									evt.stopPropagation();
								},
							},
							{className: "current"},
							{
								tag: "button", type: "button",
								className: "next", textContent: "▸",
								onclick: evt => {
									RefTest.next(type);
									evt.stopPropagation();
								},
							},
						],
					},
				],
				onclick: RefTest.next.bind(RefTest, type),
			};
		}),
	],
});

// HTML tooltips
var cellHTML = new WeakMap();
var cells = $$("table.reftest td");
cells.forEach(td => {
	cellHTML.set(td, td.attributes.length > 0 ? td.outerHTML : td.innerHTML);
});

$$("table.reftest").forEach(table => {
	if (!table.reftest) {
		new RefTest(table);
	}
});

function loadCSS (url) {
	document.head.insertAdjacentHTML("beforeend", `<link rel="stylesheet" href="${url}">`);
}

// Isolate specific test
document.addEventListener("dblclick", evt => {
	if (evt.altKey) {
		let test = evt.target.closest(".reftest > tbody > tr");

		if (test) {
			location.hash = test.id;
		}
	}
});


Object.assign(globalThis, {
	Test,
});

for (let key in Test) {
	globalThis[key] = Test[key];
}
