{ // Careful: this is NOT run in module context!
let currentPage;

if (/\/$/.test(location.pathname)) {
	currentPage = "index";
}
else {
	currentPage = (location.pathname.match(/\/([a-z-]+)(?:\.html|\/?$)/) || [, "index"])[1];
}

document.documentElement.style.setProperty("--page", `"${currentPage}"`);


let isIndex = document.documentElement.classList.contains("index");
let loaded = import(`https://html.htest.dev/src/${isIndex? "harness" : "testpage"}.js`);

let util;

async function ready (doc = document) {
	await new Promise(resolve => {
		if (doc.readyState !== "loading") {
			resolve();
		}
		else {
			doc.addEventListener("DOMContentLoaded", resolve, {once: true});
		}
	});
	await Promise.all([
		loaded,
		import("https://html.htest.dev/src/util.js").then(m => util = m)
	]);
}

/**
 * Global functions to be available to tests
 */

async function $out (...texts) {
	var script = this instanceof HTMLElement && this.matches("script")? this : document.currentScript;

	for (let text of texts) {
		if (typeof text === "function") {
			await ready();
			try {
				text = text();
			}
			catch (err) {
				text = `<div onclick="console.log(\`${err.stack}\`)">${err}</div>`;
			}
		}

		text = util.output(text);

		if (document.readyState == "loading") {
			document.write(text);
		}
		else if (script && script.parentNode) {
			script.insertAdjacentHTML("afterend", text);
		}
		else {
			console.log(script, script.parentNode)
			console.log("Test print", text);
		}
	}
}

function $outln (...text) {
	$out(...text, " ", document.createElement("br"));
}

Object.assign(globalThis, {$out, $outln});

}