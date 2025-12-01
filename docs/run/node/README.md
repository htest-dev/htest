# CLI

When [defining tests with JS](../../define/js/), most of the time you would want to run them in Node.
This allows you to use CI (continuous integration) services like Travis CI and GitHub Actions,
post-commit hooks, and other tools that run on the command line.

## Setup and requirements

For your tests to work with the Node.js runner, your JS code needs to be compatible with Node.js.
You need at least Node.js 16.x, but it is recommended to use the latest LTS version.

While to [run HTML tests](../define/html) it may be enough to simply link to hTest’s JS and CSS files,
to run JS tests in Node, you need to use npm to install hTest:

```sh
npm i htest.dev -D
```

## Zero hassle, some control

You just use the `htest` command line tool to run your tests:

```sh
npx htest tests
```

By default, hTest will look for all JS files in the directory you specify except for those starting with `index`.
You can use a glob to customize this:

```sh
npx htest tests/*.js,!tests/util.js
```

## Minimal hassle, more control

You can create your own CLI script to run your tests, by importing the same code the `htest` command line tool uses:

```js
import htest from "../node_modules/htest.dev/src/cli.js";

let test = {
	name: "Addition",
	run: (a, b) => a + b,
	args: [1, 2],
	expect: 3,
}

htest(test, {verbose: true});
```

Try running it:

```sh
node my-test.js
```

## More hassle, total control

With both previous methods you can still pass command line arguments as well and hTest processes them:

```sh
node my-test.js footests.js
```

If you pass a directory, hTest will look for all JS files in that directory except for those starting with `index`.

If that's not desirable, you can use the lower level `run()` function:

```js
import run from "../node_modules/htest.dev/src/run.js";
import fooTests from "./foo.js";
import barTests from "./bar.js";

run({
	name: "All tests",
	tests: [
		fooTests,
		barTests,
	]
});
```

You could even have separate files for this:

`tests/index-fn.js`:

```js
import fooTests from "./foo.js";
import barTests from "./bar.js";

export default {
	name: "All tests",
	tests: [
		fooTests,
		barTests,
	]
}
```

`tests/index.js:`

```js
import run from "../node_modules/htest.dev/src/cli.js";
import tests from "./index-fn.js";

run(tests);
```

Just like `htest()`, any string arguments in the `run()` function are interpreted as globs (relative to the current working directory):

```js
import run from "../node_modules/htest.dev/src/run.js";

run("tests/*.js");
```

## Running in CI environments

For continuous integration environments, you can use the `--ci` flag to optimize output for CI systems:

```sh
npx htest tests --ci
```

This mode:
- Disables interactive elements
- Outputs in a format optimized for CI logging
- Exits with code `1` if any tests fail

You can use it in your `package.json` scripts:

```json
{
  "scripts": {
    "test": "npx htest tests --ci"
  }
}
```

Example GitHub Actions workflow:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: npm test
```
