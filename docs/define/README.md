# Defining tests

Tests are defined and grouped by object literals with a defined structure.
Each of these objects can either be a test, or contain child tests.
All properties work across both: if a property doesn’t directly apply to a group, it inherits down to the tests it contains.
This allows you to only specify what is different in each test,
and makes it easier to evolve the testsuite over time.
You can access the inherited property via `this.parent` when re-defining either of these properties on a child or descendant test; for example, `this.parent.run(...args)`.

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
| [`data`](#data) | Object | Data that will be accessible to the running function as `this.data`. |
| [`name`](#name) | String or Function | A string that describes the test. |
| [`getName`](#name) | Function | A function that generates the test name dynamically. |
| [`description`](#description) | String | A longer description of the test or group of tests. |
| [`id`](#id) | String | A unique identifier for the test. |
| [`expect`](#expect) | Any | The expected result. |
| [`getExpect`](#expect) | Function | A function that generates the expected result dynamically. |
| [`throws`](#throws) | Boolean, Error subclass, or Function | Whether an error is expected to be thrown. |
| [`maxTime`](#maxtime) | Number | The maximum time (in ms) that the test should take to run. |
| [`maxTimeAsync`](#maxtimeasync) | Number | The maximum time (in ms) that the test should take to resolve. |
| [`map`](#map) | Function | A mapping function to apply to the result and expected value before comparing them. |
| [`check`](#check) | Function | A custom function that takes the result and the expected value (if present) as argments and returns a boolean indicating whether the test passed. |
| [`skip`](#skip) | Boolean | Whether to skip the test(s). |
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

### Setup and teardown (`beforeEach`, `afterEach`, `beforeAll`, `afterAll`) { #setup-teardown }

Some tests require setup and teardown code that runs before and after the test or group of tests, such as setting up DOM fixtures.

Functions `beforeEach` and `afterEach` define the code to run before and after *each test* if it is not [skipped](#skip).
Functions `beforeAll` and `afterAll` define the code to run before and after *all tests in the group* regardless of whether they are skipped.

All of these functions can be either sync or async.

You can define a single `beforeEach` or `afterEach` function on a parent or ancestor and differentiate child tests via [`args`](#args) and [`data`](#data).

### `data`: Context parameters

`data` is an optional object with data that will be accessible to the running function as `this.data`.
A test’s data is merged with its parent’s data, so you can define common data at a higher level and override it where needed.
It is useful for differentiating the behavior of `run()` across groups of tests without having to redefine it or pass repetitive arguments.

## Describing the test

### Names and name generators (`name` and `getName()`) { #name }

`name` is a string that describes the test.
It is optional, but recommended, as it makes it easier to identify the test in the results.

`name` can also be a *name generator* function.
It is called with the same context and arguments as `run()` and returns the name as a string.
You can also explicitly provide a function, via `getName`.
This can be useful if you want to specify a name for the root of tests, as well as a name generator for child tests.
In fact, if `name` is a function, it gets rewritten as `getName` internally.

Single names are not inherited, but name generator functions are.

Name generators are useful for providing a default name for tests, that you can override on a case by case basis via `name`.
You may find `this.level` useful in the name generator, as it tells you how deep in the hierarchy the test is, allowing you to provide depth-sensitive name patterns.

If no name is provided, it defaults to the first argument passed to `run`, if any.

### Description (`description`) { #description }

`description` is an optional longer description of the test or group of tests.

### Id (`id`) { #id }

This is an optional unique identifier for the test that can be used to refer to it programmatically.

## Setting expectations:

All of these properties define the criteria for a test to pass.

To make it easier to interpret the results, each test can only have one main pass criterion: result-based, error-based, or time-based.
E.g. you can use `maxTime` and `maxTimeAsync` together, but not with `expect` or `throws`.

If you specify multiple criteria, nothing will break, but you will get a warning.

### Result-based criteria (`expect` and `getExpect()`) { #expect }

`expect` defines the expected result, so you'll be using it the most.
If `expect` is *not defined*, it defaults to the first argument passed to `run()`, i.e. `this.args[0]`.

The expected result can also be generated dynamically via `getExpect`.
It is called with the same context and arguments as `run()` and returns the expected result.

If both `expect` and `getExpect` are defined, `expect` wins.

### Error-based criteria (`throws`) { #throws }

If you are testing that an error is thrown, you can use `throws`.
`throws: true` will pass if any error is thrown, but you can also have more granular criteria:
- If the value is an `Error` subclass, the error thrown *also* needs to be an instance of that class.
- If the value is a function, the function *also* needs to return a truthy value when called with the error thrown as its only argument.

You can use `throws: false` to ensure the test passes as long as it doesn't throw an error, regardless of what value it returns.

### Time-based criteria (`maxTime`, `maxTimeAsync`)

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
- `subset`: Consider `undefined` equals to anything. The test will always pass if the expected value is `undefined`. Defaults to `false`.
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
You can set `skip: true` to skip a test.
The number of skipped tests will be shown separately.
