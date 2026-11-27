# Console

This is a basic test runner that works in any environment that supports the Console API,
without taking advantage of any fancy terminal stuff like updating the screen in place.

It allows running hTest tests in the browser console, which can provide a better debugging experience in some cases.

The basic idea is this:

```js
import tests from "./test/index.js";
import run from "https://htest.dev/src/run.js";

run(tests, {env: "console"});
```

which you can run from any HTML page.

In fact, you can leave the environment out. This defaults to `"auto"`,
which detects whether the code is running in Node and uses the CLI output if so and the `console` environment otherwise.

```js
import tests from "./test/index.js";
import run from "https://htest.dev/src/run.js";

run(tests);
```