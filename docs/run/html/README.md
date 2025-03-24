---
nav: Browser (HTML reftests)
---

# Running tests in the browser (as HTML reftests)

These tests provide a UI very similar to [HTML-first reftests](https://html.htest.dev/), and can be useful
for providing a unified front if your testsuite includes both.

## Running JS-first tests in the browser

To run HTML-first tests in the browser, you just open the HTML file.
For JS-first tests, you need to create an HTML file that runs the tests.

For a test file named `test.js`, the HTML file would look like this:

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Tests</title>
	<link rel="stylesheet" href="https://htest.dev/htest.css" crossorigin />
</head>
<body>
	<script type="module">
		import "https://htest.dev/htest.js";
		import render from "https://htest.dev/src/render.js";
		import test from './test.js';
		render(test);
	</script>
</body>
</html>
```

You could even use a URL param to specify the test file, so you can use one HTML file for all your tests:

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Tests</title>
	<link rel="stylesheet" href="https://htest.dev/htest.css" crossorigin />
</head>
<body>
	<script type="module">
		import "https://htest.dev/htest.js";
		import render from "https://htest.dev/src/render.js";
		let params = new URLSearchParams(location.search);
		let test = await import(params.get('test'));
		render(test);
	</script>
</body>
</html>
```

Then you'd run it `foo.js` by visiting `index.html?test=foo.js`.

In fact, you could configure it to output an index of tests if no test is provided, encapsulating your entire testsuite in one HTML file!

<details>
<summary>View code</summary>

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<title>Tests</title>
	<link rel="stylesheet" href="https://htest.dev/htest.css" crossorigin />
	<script src="https://htest.dev/htest.js" type="module" crossorigin></script>
	<script>
		let params = new URLSearchParams(location.search);
		let test_url = params.get('test');

		if (test_url) {
			let test_url_ext = test_url.match(/\.(\w+)$/)?.[1];

			if (!test_url_ext) {
				test_url += '.js';
			}

			if (/^\w+\.\w+$/.test(test_url)) {
				test_url = `./${test_url}`;
			}

			Promise.all([
				import("https://htest.dev/src/render.js").then(m => m.default),
				import(test_url).then(m => m.default),
			]).then(([render, test]) => render(test));
		}
		else if (parent === self) {
			document.documentElement.classList.add('index');

			// Index of all tests
			fetch('./index.json').then(r => r.json()).then(index => {
				index = Object.entries(index).map(([id, name]) => ({ id, name }));

				document.body.innerHTML = `
				<section>
					<h1>Tests</h1>

					<ul id="tests">
						${index.map(test => `
							<li>
								<a href="?test=${test.id}">${test.name}</a>
							</li>
						`).join('\n')}
					</ul>
				</section>
				`;
			});
		}
	</script>
</head>
<body>
</body>
</html>
```

</details>

You can see this in action at [Color.js](https://colorjs.io/test/).
Note that this requires an `index.json` with test filenames to names. You can also hardcode the data in your index, or use a different format — you'd just need to tweak the code accordingly.

<div class=note>

When viewing JS-first tests in HTML, top-level tests are rendered as sections, and all their descendants are rendered inside the same table.

</div>

## Test runner UI

### Isolating tests

It is often useful to isolate a single group of tests, or even a single test so you can debug a particular failure.

To isolate a group of tests (`<section>`), simply click the link of the section heading.

To isolate a specific test (`<tr>`), hold down the <kbd>Alt</kbd>/<kbd>Option</kbd> key and double click on the table row.
