<header class="readme-only">

# <img src="assets/images/logo.svg" class="logo" width="22"> **h**Test

Declarative, boilerplate-free unit testing, for everyone.

https://htest.dev
<hr class="readme-only" />
</header>

<nav class="sidebar" id="main-contents">

- [Installation](#installation)
- [Quick Start](#quick-start)
- [What the hTest?](#what-the-htest%3F-do-we-really-need-another-unit-testing-framework%3F)
- [Interactive CLI](#interactive-cli-output)
- [Roadmap](#roadmap)
- [hTest in the wild](#htest-in-the-wild)

</nav>

<main>

## Features at a glance

- <span>✅</span> **Friendly**: Never used a unit test framework before? No problem! hTest is designed to be as friendly as possible to newcomers.
- <span>✅</span> **Declarative**: Write your tests as nested object literals, with nice, readable syntax.
- <span>✅</span> **Flexible**: You decide where your tests live, across how many files, and how they’re grouped. Anything you can `import`, you can test.
- <span>✅</span> **Boilerplate-free**: Any commonalities between tests only specified once on the parent, and inherited. Anything that can be optional, is.
- <span>✅</span> **Quick to write**: Most tests only need two properties: `args` and `expect`. No more excuses for not testing your utility functions!
- <span>✅</span> **ESM-first**: Written in ESM from the get-go.
- <span>✅</span> **CLI and browser**: Run your tests in the command line, in the browser, or both.
- <span>✅</span> **CI-ready**: Fully compatible with continuous integration and automated test running processes.
- <span>✅</span> **Optional HTML-first mode**: Working on UI-heavy code? Write tests in HTML, with reactive evaluation and mock interactions!

## Installation

```sh
npm install htest.dev
```

## Quick start

Suppose you have written a utility function `sum()` that takes a variable number of arguments and adds them together.
Testing it could be as simple as:

```js
import { sum } from "../src/util.js";

export default {
	run: sum,
	tests: [
		{
			arg: 1,
			expect: 1
		},
		{
			args: [1, 2, 3],
			expect: 6
		},
		{
			args: [],
			expect: undefined
		}
	]
}
```

Yes, **that’s really it**!
You can add `name`, `description` and other metadata if you want, but you don’t have to.

But the real power of hTest is in its nested structure.
Suppose we wanted to add more tests for `sum()`, e.g. for the case where you’re summing with `NaN`.
We can abstract away the commonality between these tests, and write them as a nested object:

```js
import { sum } from "../src/util.js";

export default {
	run: sum,
	tests: [
		{
			arg: 1,
			expect: 1
		},
		{
			args: [1, 2, 3],
			expect: 6
		},
		{
			args: [],
			expect: undefined
		},
		{
			name: "With NaN",
			run (...args) {
				return sum(NaN, ...args);
			},
			expect: NaN,
			tests: [
				{
					args: [1, 2, 3],
				},
				{
					args: [],
				},
				{
					args: [NaN]
				}
			]
		}
	]
}
```

Now let’s suppose these NaN tests grew too much to be maintained in a single file. You can just move them whenever you want, and import them:

```js
import { sum } from "../src/util.js";
import NaNTests from "./sum-nan.js";

export default {
	run: sum,
	tests: [
		{
			arg: 1,
			expect: 1
		},
		{
			args: [1, 2, 3],
			expect: 6
		},
		{
			args: [],
			expect: undefined
		},
		NaNTests
	]
}
```

Of course this is a rather contrived example, but it showcases some of the essence of hTest.

## What the hTest? Do we really need another unit testing framework?

Unit testing is hard enough as it stands — the more friction in writing tests, the fewer get written.
**hTest** is a unit testing framework that focuses on making it as quick and painless as possible to write tests.
Forget nested function calls with repetitive code.
hTest aims to eliminate all boilerplate, so you can focus on writing the actual tests.



hTest can be used in one of two ways: [JS-first](docs/define/js/) or [HTML-first](docs/define/html/).

<table>
<thead>
<tr>
<th>

JS-first mode
</th>
<th>

HTML-first mode
</th>
</tr>
</thead>
	<tbody>
		<tr>
			<td>

Write your tests in nested object literals, and you can [run them either in Node](docs/run/node) or [in the browser](docs/run/html).
Tests inherit values they don’t specify from their parents, so you never have to repeat yourself.
</td>
<td>

Write your tests in HTML files and run them only in the browser.</td>
<tr>
<td>

* More suitable for pure JS code.
* Compatible with CI and other automated test running processes.
* Code must be compatible with Node to use the Node test runner.

</td>
<td>

* More suitable for UI-heavy code.
* Pass-criteria extends beyond value matching or error catching, and could even be things like what CSS selectors match or what the DOM looks like.
* Reactive evaluation: if the HTML changes or the user interacts with the UI, relevant tests are re-evaluated.
* Mock interactions like click or focus with HTML attributes.

</td>
</tr>
	</tbody>
</table>

You can even mix and match the two modes in the same testsuite!
E.g. even a UI-heavy library has many JS-only functions that are better tested via JS-first tests.

## Interactive CLI output

![Sample terminal output](assets/images/terminal-output.png)

The CLI output with test results is built as an _interactive tree_ that starts collapsed but can be navigated and expanded with the keyboard. Messages written to the console while the test suite runs are preserved and part of the corresponding test results.

<video controls>
	<source src="assets/videos/interactive-cli.mp4" type="video/mp4" />
</video>

### Supported keys and keyboard shortcuts

- <kbd>↑</kbd> — “Go Level Up”
- <kbd>↓</kbd> — “Go Level Down”
- <kbd>→</kbd> — “Expand Group”
- <kbd>←</kbd> — “Collapse Group.” Consecutively press <kbd>←</kbd> to collapse the current group first, then the parent group, then the grandparent group, and so on.
- <kbd>Ctrl</kbd>+<kbd>↑</kbd> — “Go to the First Child of a Group”
- <kbd>Ctrl</kbd>+<kbd>↓</kbd> — "Go to the Last Child of a Group"
- <kbd>Ctrl</kbd>+<kbd>→</kbd> — "Expand Subtree" (starting from the current group)
- <kbd>Ctrl</kbd>+<kbd>←</kbd> — "Collapse Subtree" (including the current group)
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>→</kbd> — "Expand All"
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>←</kbd> — "Collapse All"

## Roadmap

hTest is still a work in progress, but is stable enough to be used in production.
It was soft launched in Q4 2023, but has been in use since 2022 (2017 if you count its early precursor — though that only included the HTML syntax).

The main things that still need to be done before launch are:
* Improve documentation — this is top priority, people keep asking for things that are already possible because they’re not documented well!
* Fix CLI output glitches
* Implement watch functionality
* Ensure we're not missing essential use cases

Any help with these would be greatly appreciated!

## hTest in the wild

### JS-first testsuites

* [Color.js](https://colorjs.io/test/) [\[source\]](https://github.com/color-js/color.js/tree/main/test)
* [vᴀꜱᴛly](https://vastly.mavo.io/test/) [\[source\]](https://github.com/mavoweb/vastly/tree/main/test)

### HTML-first testsuites

#### Testsuites

* [Color.js old testsuite](https://colorjs.io/tests/)
* [Mavo](https://test.mavo.io) (using a precursor of hTest)

#### Single page tests

* [Parsel](https://parsel.verou.me/test.html)
* [Stretchy](https://stretchy.verou.me/test.html)

</main>
