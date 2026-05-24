# Defining tests

Tests are defined and grouped by object literals with a defined structure.
Each of these objects can either be a test, or contain child tests.
All properties work across both: if a property doesn’t directly apply to a group, it inherits down to the tests it contains.
This allows you to only specify what is different in each test,
and makes it easier to evolve the testsuite over time.
You can access the inherited property via `this.parent` when re-defining either of these properties on a child or descendant test; for example, `this.parent.run(...args)`.

Tests at the same nesting level run **in parallel**, so don't rely on execution order or shared mutable state between sibling tests.

## Property index

**All properties are optional**.

<div class="scrollable">

| Property | Type | Description |
|----------|------|-------------|
| [`run`](#run) | Function | The code to run. |
| [`args`](#args) | Array | Arguments to pass to the running function. |
| [`arg`](#args) | Any | A single argument to pass to the running function. |
| [`beforeEach`](#setup-teardown) | Function | Code to run before each test. |
| [`afterEach`](#setup-teardown) | Function | Code to run after each test. |
| [`beforeAll`](#setup-teardown) | Function | Code to run before all tests in the group. |
| [`afterAll`](#setup-teardown) | Function | Code to run after all tests in the group. |
| [`data`](#data) | Object, Function, or Accessor | Data that will be accessible to the running function as `this.data`. |
| [`getData`](#data) | Function | Legacy: a function that generates data dynamically (eager). Prefer `get data () { ... }`. |
| [`name`](#name) | String, Function, or Accessor | A string that describes the test. |
| [`getName`](#name) | Function | Legacy: a function that generates the test name dynamically (eager). Prefer `get name () { ... }`. |
| [`description`](#description) | String | A longer description of the test or group of tests. |
| [`id`](#id) | String | A unique identifier for the test. |
| [`expect`](#expect) | Any or Accessor | The expected result. |
| [`getExpect`](#expect) | Function | Legacy: a function that generates the expected result dynamically (eager). Prefer `get expect () { ... }`. |
| [`throws`](#throws) | Boolean, Error subclass, or Function | Whether an error is expected to be thrown. |
| [`maxTime`](#maxtime) | Number | The maximum time (in ms) that the test should take to run. |
| [`maxTimeAsync`](#maxtime) | Number | The maximum time (in ms) that the test should take to resolve. |
| [`map`](#map) | Function | A mapping function to apply to the result and expected value before comparing them. |
| [`check`](#check) | Function or Object | A custom function or options object for comparing the result with the expected value. |
| [`skip`](#skip) | Any | Any truthy value skips the test(s). |
</div>

## Defining the test

### Defining the code to be tested (`run`) { #run }

`run` defines the code to run, as a function. It can be either sync or async.
It is common to define a single `run` function on a parent or ancestor and differentiate child tests via `args` and `data` (described below).

### Argument(s) to pass to the testing function (`args` and `arg`)  { #args }

There are two ways to pass arguments to the running function:
- `args` is an array of arguments to pass
If you pass a single argument, it will be converted to an array.
- `arg` will *always* be assumed to be a single argument, even when it’s an array.
If both `arg` and `args` are defined, `arg` wins.

`arg` is internally rewritten to `args`, so in any functions that run with the current test as their context you can just use `this.args` without having to explicitly check for `this.arg`

### Lifecycle hooks (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`) { #setup-teardown }

Some tests require setup and teardown code that runs before and after the test or group of tests, such as setting up DOM fixtures.
These four properties are collectively called *lifecycle hooks*.

`beforeEach` and `afterEach` run before and after *each test* if it is not [skipped](#skip).
`beforeAll` and `afterAll` run before and after *all tests in the group* regardless of whether they are skipped.

All hooks can be either sync or async.

#### Inheritance

`beforeEach` and `afterEach` are inherited like [`run`](#run): a child that doesn't define its own gets the parent's.
A child that defines its own **overrides** the parent's — they are not chained automatically.
`beforeAll` and `afterAll` are **not inherited** — they only run at the group where they are defined.

To call the parent's hook from a child override, use `this.parent.<hook>()`.
This gives you full control over where the parent's logic runs — before your own, after it, or in the middle:

```js
{
	beforeEach () {
		this.parent.beforeEach();   // parent's setup first
		this.data.extra = "child";  // then child-specific setup
	},
}
```

#### Error handling

If a hook throws, the test is **skipped** — not failed.

| Scenario | Test runs? | Cleanup runs? | Result |
|---|---|---|---|
| `beforeAll` throws | No | `afterAll` still runs | All tests in group **skipped** |
| `beforeEach` throws | No | `afterEach` still runs | Test **skipped** |
| `afterEach` throws | Already ran | — | Test **skipped** |
| `afterAll` throws | Already ran | — | Test results **unaffected** |

You can define a single `beforeEach` or `afterEach` on a parent or ancestor and differentiate child tests via [`args`](#args) and [`data`](#data).

### Context parameters (`data` and `getData`) { #data }

`data` is an optional object with data that will be accessible to the running function as `this.data`.
A child’s data inherits from its parent’s, so you can define common data at a higher level and override it where needed.
It is useful for differentiating the behavior of `run()` across groups of tests without having to redefine it or pass repetitive arguments.

`data` can also be a getter or function shorthand that generates fresh data per test:

```js
{
    get data () { return { items: [] }; },
    run () {
        this.data.items.push(1);
        return this.data.items.length;
    },
    tests: [
        { expect: 1 },
        { expect: 1 },  // Each test gets its own fresh array
    ],
}
```

The function shorthand `data () { ... }` is equivalent to `get data () { ... }` — both run with `this` bound to the Test instance, so you can read `this.args`, `this.parent.data`, etc. Returned objects are wired into the parent's data prototype chain. Accessor descriptors are inherited from parent to child, but literal data values are not (children see parent data through the chain). If the getter throws, `this.data` falls through to an empty object.

You can also explicitly provide a data generator function via the legacy `getData` property. It is called with the same context and arguments as `run()` and the returned object's properties are merged into `this.data` eagerly at construction time. `get data ()` is preferred (lazy and idiomatic JS), but `getData` remains supported. If both are defined, the accessor wins.

## Describing the test

### Names and name generators (`name` and `getName()`) { #name }

`name` is a string that describes the test.
It is optional, but recommended, as it makes it easier to identify the test in the results.

`name` can also be a getter or function shorthand that generates the name lazily:

```js
{
    get name () { return "Test " + this.args[0]; },
    tests: [{ arg: "foo" }],  // → name: "Test foo"
}
```

The function shorthand `name () { ... }` is equivalent to `get name () { ... }` — both run with `this` bound to the Test instance.

Literal `name` values are not inherited, but accessor descriptors are. This means a parent can define a `get name ()` and every child inherits the same generator (invoked with its own `this`). Children with an explicit `name` literal override the inherited accessor.

You can also explicitly provide a name generator function via the legacy `getName` property. It is called with the same context and arguments as `run()` and the returned string is used as the name (eagerly, at construction). `get name ()` is preferred (lazy and idiomatic JS), but `getName` remains supported. If both are defined, the accessor wins.

Name generators are useful for providing a default name for tests, that you can override on a case by case basis via `name`.
You may find `this.level` useful in the name generator, as it tells you how deep in the hierarchy the test is, allowing you to provide depth-sensitive name patterns.

If no name is provided, it defaults to the first argument passed to `run`, if any.

If the `name` getter throws an error (e.g. by accessing `this.run` on a group with no `run`), the error is caught and the name falls through to its default.
This allows defining a `name` getter that only works in certain contexts without crashing the test tree.

### Description (`description`) { #description }

`description` is an optional longer description of the test or group of tests.

### Id (`id`) { #id }

This is an optional unique identifier for the test that can be used to refer to it programmatically.

## Setting expectations

All of these properties define the criteria for a test to pass.

To make it easier to interpret the results, each test can only have one main pass criterion: result-based, error-based, or time-based.
E.g. you can use `maxTime` and `maxTimeAsync` together, but not with `expect` or `throws`.

If you specify multiple criteria, nothing will break, but you will get a warning.

### Result-based criteria (`expect` and `getExpect()`) { #expect }

`expect` defines the expected result, so you'll be using it the most.
If `expect` is *not defined*, it defaults to the first argument passed to `run()`, i.e. `this.args[0]`.

The expected result can also be generated dynamically with a getter:

```js
{
    run: double,
    tests: [
        { arg: 5, get expect () { return this.args[0] * 2; } },
    ],
}
```

The getter runs with `this` bound to the Test instance, so you can read `this.args` and `this.data`. The result is cached on first access. Accessor descriptors are inherited from parent to child, just like literal values.

You can also explicitly provide a generator function via the legacy `getExpect` property. It is called with the same context and arguments as `run()` and the returned value is used as `expect` (eagerly, at construction). `get expect ()` is preferred (lazy and idiomatic JS), but `getExpect` remains supported. If both are defined, the accessor wins.

If the `expect` getter throws an error, the error is caught and `expect` falls through to its default (`args[0]`).

### Error-based criteria (`throws`) { #throws }

If you are testing that an error is thrown, you can use `throws`.
`throws: true` will pass if any error is thrown, but you can also have more granular criteria:
- If the value is an `Error` subclass, the error thrown *also* needs to be an instance of that class.
- If the value is a function, the function *also* needs to return a truthy value when called with the error thrown as its only argument.

You can use `throws: false` to ensure the test passes as long as it doesn't throw an error, regardless of what value it returns.

### Time-based criteria (`maxTime`, `maxTimeAsync`) { #maxtime }

The time a test took is always measured and displayed anyway.
If the test returns a promise, the time it took to resolve is also measured, separately.
To test performance-sensitive functionality, you can set `maxTime` or `maxTimeAsync` to specify the maximum time (in ms) that the test should take to run.

## Customizing how the result is evaluated

The properties in this section center around making it easier to specify **result-based tests** (i.e. those with `expect` values).

### Defining the checking logic (`check`) { #check }

By default, if you provide an `expect` value, the test will pass if the result is equal to it (using deep equality).
However, often you don’t really need full equality, just to verify that the result passes some kind of test,
or that it has certain things in common with the expected output.

`check` allows you to provide a custom function that takes the actual result and the expected value as arguments and returns a boolean indicating whether the test passed.
If the return value is not a boolean, it is coerced to one.
You can use any existing assertion library, but hTest provides a few helpers in `/src/check.js` (import `htest/check`):

All of these take parameters and return a checking function:
- `and(...fns)`: Combine multiple checks with logical AND.
- `or(...fns)`: Combine multiple checks with logical OR.
- `is(type)`: Check if the result is of a certain type.
- `deep(shallowCheck)`: Check if the result passes a deep equality check with the expected value.
- `proximity({epsilon})`: Check if the result is within a certain distance of the expected value.
- `range({min, max, from, to, lt, lte, gt, gte})`: Check if the result is within a certain range.
- `between()`: Alias of `range()`.

There are also the following checking functions that can be used directly:
- `equals()`: Check if the result is equal to the expected value.

Instead of providing a custom checking function, you can also tweak the default one — the `equals()` function. Simply pass an object literal with desired options as the value of `check`, and hTest will produce the proper checking function for you.
The supported options are:
- `deep`: Use a deep equality check between the result and the expected value. Defaults to `false`.
- `looseTypes`: Skip the check that the result and the expected value are of the same type. If skipped, e.g. `"5"` can match `5`. Defaults to `false`.
- `subset`: Only check properties present in `expect` — extra properties in the result are ignored. Defaults to `false`.
- `epsilon`: Allowed distance between the result and the expected value. Defaults to `0`.

#### Examples

```js
import * as check from "../node_modules/htest.dev/src/check.js";

export default {
	run: Math.random,
	args: [],
	check: check.between({min: 0, max: 1}),
}
```

You can even do logical operations on them:

```js
import getHue from "../src/getHue.js";
import * as check from "../node_modules/htest.dev/src/check.js";

export default {
	run (color) { getHue(color) },
	args: ["green"],
	expect: 90,
	check: check.and(
		check.is("number"),
		check.proximity({epsilon: 1})
	)
}
```

Or, for nicer syntax:

```js
import getHue from "../src/getHue.js";
import {and, is, proximity } from "../node_modules/htest.dev/src/check.js";

export default {
	run (color) { getHue(color) },
	args: ["green"],
	expect: 90,
	check: and(
		is("number"),
		proximity({epsilon: 1})
	)
}
```

hTest can build the right checking function behind the scenes:

```js
export default {
	arg: [1.01, 2, 3.042],
	expect: [1, 2, 3],
	check: {deep: true, epsilon: .1}
}
```

### Mapping the result and expected value (`map`) { #map }

In some cases you want to do some post-processing on both the actual result and the expected value before comparing them (using `check`).
`map` allows you to provide a mapping function that will be applied to both the result and the expected value before any checking.
If the test return value is an array, each individual item will be mapped separately.

Some commonly needed functions can be found in `/src/map.js` (import `htest/map`).
The following are *mapping function generators*, i.e. take parameters and generate a suitable mapping function:
- `extract(patterns)`: Match and extract values using regex patterns and/or fixed strings

These can be used directly:
- `extractNumbers()`: Match and extract numbers from strings
- `trimmed()` : Trim strings

### Skipping tests (`skip`) { #skip }

Often, we have written tests for parts of the API that are not yet implemented.
It doesn't make sense to remove these tests, but they should also not be making the testsuite fail.
Any truthy value skips the test. `skip: true` is the simplest form, but you can use any expression evaluated at module load time, e.g. `skip: !globalThis.structuredClone`.
The number of skipped tests will be shown separately.
