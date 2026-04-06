---
name: htest
description: Use when writing or modifying tests with hTest (htest.dev) — JS-first or HTML-first. Use when a project has htest.dev in devDependencies or uses `npx htest` to run tests. Use when writing declarative tests as nested object literals, or reftest tables in HTML.
---

# hTest Tests

Two modes: **JS-first** for logic (runs in Node or browser, CI-compatible) and **HTML-first** for UI (runs in browser only, reactive).

## JS-First Mode

Declarative testing framework. Tests are nested object literals — most tests need only `arg` + `expect`.

## Core Pattern

```js
import { myFn } from "../src/my-fn.js";

export default {
	name: "myFn()",
	run: myFn,
	tests: [
		{
			name: "descriptive name",
			arg: "input",
			expect: "output",
		},
	],
};
```

## Test Object Properties

All properties are optional and inherit from parent to child.

### Execution

| Property    | Description                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run`       | Function to execute. Called via `run.apply(testInstance, args)`. Inherited from parent — define once, never repeat. If omitted, result defaults to `args[0]`                                                          |
| `arg`       | Single argument passed to `run`. Can be any value                                                                                                                                                                     |
| `args`      | Array of arguments passed to `run`. Non-arrays auto-wrapped. `arg` takes precedence. **If your function takes an array as a single argument, use `arg` — `args: [1, 2, 3]` calls `fn(1, 2, 3)`, not `fn([1, 2, 3])`** |
| `expect`    | Expected result. Deep equality by default                                                                                                                                                                             |
| `getExpect` | Function to generate expected value dynamically. Called like `run`: `getExpect.apply(test, args)`. Inherited. `expect` takes precedence if both are set                                                               |
| `throws`    | `true` (any error), `false` (asserts no error thrown), Error subclass (`TypeError`), or predicate `e => e.code === "ENOENT"`. Inherited                                                                               |

### Structure

| Property      | Description                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Test/group label. Also accessible via `this.name` and `this.parent.name` in `run`. If a function, it's used as `getName` instead |
| `getName`     | Function to generate names dynamically. Called like `run`: `getName.apply(test, args)`. Inherited (unlike `name`)                |
| `description` | Human-readable explanation of the test's intent or edge case. Ignored by the runner                                              |
| `tests`       | Array of child tests. If present, this is a group (parent); if absent, a leaf test                                               |
| `data`        | Inherited object accessible via `this.data`. Child data merges with parent                                                       |
| `skip`        | `true` or function returning truthy to skip. Inherited — setting on a parent skips all children                                  |

### Comparison

| Property | Description                                                                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------- |
| `check`  | Custom assertion: function `(actual, expect) => boolean` or object `{ deep, looseTypes, subset, epsilon }`. Inherited |
| `map`    | Transform result before comparison. **Applies to both result AND expected**. Inherited                                |

Default check is `deep(shallowEquals())` — recursive `===` at leaf level.

### `check` Object Shorthand

Pass an object instead of a function to configure built-in comparison behavior:

| Option       | Default | Behavior                                                                   |
| ------------ | ------- | -------------------------------------------------------------------------- |
| `subset`     | `false` | Extra properties in actual are OK; `undefined` expected values are skipped |
| `epsilon`    | `0`     | Numeric tolerance: passes if `Math.abs(actual - expect) <= epsilon`        |
| `looseTypes` | `false` | Use `==` instead of `===` at leaf level                                    |
| `deep`       | `true`  | Recurse into objects/arrays. Set `false` for shallow-only                  |

**`subset: true` is the most useful option.** Use it when results may contain extra fields you don't want to validate:

```js
{
	run: parseItem,
	check: { subset: true },   // inherited by all children
	tests: [
		{ arg: "foo:bar", expect: { key: "foo", value: "bar" } },
		// passes even if parseItem() also returns { raw: "foo:bar", index: 0, ... }
	],
}
```

Combine options freely:

```js
check: { epsilon: 0.005 }                    // numeric tolerance, deep (default)
check: { subset: true, epsilon: 0.0001 }     // partial match + tolerance
check: { deep: false, looseTypes: true }     // shallow loose equality
```

For a custom comparison, use an inline function — no import needed:

```js
{
	check: (actual, expect) => Math.abs(actual - expect) < 0.01,
	tests: [...],
}
```

For pre-built utilities and composition, import the check module:

```js
import check from "htest.dev/check";

export default {
	run: computeValue,
	check: check.proximity({ epsilon: 0.005 }),          // pre-built deep + tolerance
	// check: check.deep(check.proximity({ epsilon: 0.005 })),  // composed
	tests: [...],
};
```

### Lifecycle

| Property                   | Description                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `beforeEach` / `afterEach` | Run before/after each test. Inherited. `afterEach` runs even if the test throws. Sync or async |
| `beforeAll` / `afterAll`   | Run before/after all tests in the group where defined. **Not inherited**                       |

## `this` Inside `run`

`run` is called with `this` set to the Test instance. Available properties:

- `this.args` — argument array
- `this.data` — inherited data object
- `this.name` — test name
- `this.level` — nesting depth (root = 0). Useful in `getName` for depth-aware labels
- `this.parent` — parent test/group. Useful for extending the parent's `run` in a child: call `this.parent.run(...args)` first, then transform the result
- `this.expect` — expected value

## Async

hTest auto-awaits Promises returned from `run`. No special handling needed:

```js
{
	async run () {
		let result = await fetchSomething();
		return result.value;
	},
	expect: 42,
}
```

## Parallel Execution

Tests at the same nesting level run **in parallel** (`Promise.allSettled`). Don't rely on execution order or shared mutable state between sibling tests:

```js
let counter = 0;

// ❌ Sibling tests run in parallel — counter increments are nondeterministic
{
	tests: [
		{ run: () => ++counter, expect: 1 },
		{ run: () => ++counter, expect: 2 },
	],
}

// ✅ Each test is self-contained
{
	tests: [
		{ run: () => "foo".toUpperCase(), expect: "FOO" },
		{ run: () => "bar".toUpperCase(), expect: "BAR" },
	],
}
```

## Inheritance

Properties cascade from parent to child. Children only specify what differs:

```js
{
	run: parse,             // Shared by all children
	tests: [
		{ arg: "foo", expect: { type: "foo" } },               // inherits run
		{ arg: "bar baz", expect: { type: "bar", mod: "baz" } },
	],
}
```

Override `run` at group level when a subset needs different logic:

```js
let item = { id: 1 };

{
	name: "Promise",
	async run (arg) {
		let result = transform(Promise.resolve(arg));
		return { value: await result.value };
	},
	tests: [
		{ arg: item, expect: { value: item } },     // inherits async run
		{ arg: "foo", expect: { value: "bar" } },
	],
}
```

## Reference Equality for Instances

hTest's default check uses `===` at leaf level. Share the same instance between `arg` and `expect`:

```js
let config = new Map([["key", "value"]]);

// ✅ Same instance — passes
{ arg: config, expect: { result: config } }

// ❌ Different instances — fails
{ arg: new Map([["key", "value"]]), expect: { result: new Map([["key", "value"]]) } }
```

## `map` — Both Sides

`map` transforms **both** result and expected before comparison. When either is an array, `map` is applied element-wise. Design so expected values pass through unchanged:

```js
{
	map (result) {
		if (result?.items instanceof Set) {
			return { ...result, items: [...result.items] };
		}
		return result;
	},
	tests: [
		{ arg: { items: new Set(["a", "b"]) }, expect: { items: ["a", "b"] } },
	],
}
```

## `data` — Shared Fixtures

`data` shines when multiple tests operate on the same complex object or when nested groups need to vary a single configuration parameter while sharing everything else.

**Good use: shared object, accessed via `this.data`**

```js
export default {
	data: {
		user: new User({ name: "alice", role: "admin" }),
	},
	run(method) {
		return this.data.user[method]();
	},
	tests: [
		{ arg: "isAdmin", expect: true },
		{ arg: "getLabel", expect: "Admin: alice" },
	],
};
```

**Good use: nested groups vary one config value**

```js
export default {
	run(arg) {
		return transform(arg, this.data.mode);
	},
	tests: [
		{
			name: "strict mode",
			data: { mode: "strict" },
			tests: [{ arg: "foo", expect: "FOO" }],
		},
		{
			name: "loose mode",
			data: { mode: "loose" },
			tests: [{ arg: "foo", expect: "foo" }],
		},
	],
};
```

**Don't use `data` when the value is only used in one place — inline it instead:**

```js
// ❌ Unnecessary indirection
data: { prefix: "https://example.com/" },
run (arg) { return fn(arg, this.data.prefix); },

// ✅ Just inline it
run (arg) { return fn(arg, "https://example.com/"); },
```

## Module-Level Setup

`arg` and `expect` expressions are evaluated at import time — during `Test` construction, before any hooks run. A variable that will be assigned in `beforeAll` is still `undefined` when `arg` captures it:

```js
// ❌ db is undefined at import time — beforeAll hasn't run yet
let db;

export default {
	beforeAll () { db = createFakeDatabase(); },
	tests: [
		{ arg: db, expect: { rows: 0 } },  // arg captures undefined, not the db object
	],
};

// ✅ Module top level — exists when arg expressions evaluate
let db = createFakeDatabase();

export default {
	run: query,
	tests: [
		{ arg: db, expect: { rows: 0 } },
	],
};
```

This applies to any setup that `arg`/`expect` depends on: mock classes, shared fixtures, or preconfigured instances.

## Data-Driven Test Generation

Test arrays are plain JS — you can build them with `.map()`, `.flatMap()`, or any array method before exporting:

```js
const cases = [
	{ input: "foo", expected: "FOO" },
	{ input: "bar", expected: "BAR" },
];

export default {
	run: toUpperCase,
	tests: cases.map(({ input, expected }) => ({
		arg: input,
		expect: expected,
	})),
};
```

Useful for tests driven by an external data file, a registry, or computed expected values:

```js
// Compute expected from a reference implementation
tests: rawCases.map(c => ({ ...c, expect: referenceImpl(c.arg) })),
```

## Running Tests

```bash
npx htest test/file.js       # Single file
npx htest test/               # All JS in directory (not recursive, skips index*)
npx htest test/index.js       # Use index files for recursive aggregation
npx htest test/file.js --ci       # Force non-interactive mode (automatic in non-TTY environments)
npx htest test/file.js --verbose  # Show all tests, including passing
```

---

## HTML-First Mode

Use for UI-heavy code that needs a real DOM — web components, layout, interaction. Tests run in the browser only (not CI-compatible). Can be mixed with JS-first tests in the same suite.

### Setup

Include hTest in an HTML file — no build step needed:

```html
<link rel="stylesheet" href="https://htest.dev/htest.css" crossorigin />
<script src="https://htest.dev/htest.js" crossorigin></script>
```

Open the file directly in a browser. hTest bootstraps on `DOMContentLoaded`.

### Reftests — Core Pattern

Each `<table class="reftest">` contains tests as `<tr>` rows. The last two cells are compared (output | expected). When they match → pass; when they don't → fail.

```html
<section>
	<h1>My Component</h1>
	<table class="reftest">
		<tr>
			<td><my-component value="42"></my-component></td>
			<td>42</td>
		</tr>
	</table>
</section>
```

3-column tables add a data/setup column before output and expected (first column is ignored in matching):

```html
<tr>
	<td><!-- setup / ignored --></td>
	<td><!-- output --></td>
	<td><!-- expected --></td>
</tr>
```

### `data-test` — Comparator

Default is `"contents"` — compares trimmed text content of the last two cells.

| Value        | Behavior                                                                            |
| ------------ | ----------------------------------------------------------------------------------- |
| `"contents"` | Compare trimmed text content (default)                                              |
| `"selector"` | Reference cell is a CSS selector the output must match; add `class="not"` to negate |
| `"numbers"`  | Extract and compare numbers only; use `data-epsilon` for tolerance                  |
| `"dom"`      | Compare nodeName, attributes, and text content structurally                         |

Can also be a JS expression or global function name receiving the cells as arguments.

### `data-click` — Simulate Interaction

Automates clicks for reactive tests. Syntax: `[selector] [wait Ns] [after eventname] [N times]`

```html
<!-- Click the button, then evaluate tests -->
<table class="reftest" data-click="button">
	<!-- Click after load, with delay -->
	<tr data-click="button wait 1s after load"></tr>
</table>
```

### `data-error` — Expected Throws

```html
<tr data-error>
	<td>
		<script>
			throw new TypeError("bad");
		</script>
	</td>
	<td>TypeError</td>
</tr>
```

### Isolation / Debugging

- Click a `<section>` heading link → show only that section's tests
- Alt + double-click a `<tr>` → isolate that single test
- "Show all tests" link appears to restore the full suite

### When to Use Each Mode

|                           | JS-first | HTML-first |
| ------------------------- | -------- | ---------- |
| Pure logic, utilities     | ✅       | —          |
| CI pipeline               | ✅       | ❌         |
| Real DOM / web components | —        | ✅         |
| Simulated interactions    | —        | ✅         |
| Reactive re-evaluation    | —        | ✅         |

---

## Best Practices

1. **`arg` + `expect` is the default** — any test that can't be expressed this way is a smell. If you're writing a custom `run` per test, pull a shared `run` up to the group level instead.
2. **Structure mirrors API** — nest test groups to match your module's shape. One export = one top-level group. The hierarchy should let you locate any test by navigating the API.
3. **Check the shape, not every byte** — use `check: { subset: true }` when you only care about specific properties. Tests that over-specify `expect` break for wrong reasons.
4. **Each test = one unique branch** — don't test the same code path twice with different data. A passing duplicate isn't a safety net.
5. **Don't test the language** — spread, object merge, array methods: those are JavaScript, not your code. Only test behavior your function owns.

## Common Mistakes

| Mistake                                               | Fix                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Custom `run` in every test                            | Extract shared `run` at parent, vary via `arg`                                               |
| `expect: true` with boolean logic in `run`            | Return the actual result, use `map`/`check` for comparison                                   |
| Setup in `beforeAll` but used in `arg` expressions    | Move to module top level — `arg`/`expect` evaluate at import time, before hooks              |
| `new Instance()` in both `arg` and `expect`           | Share one instance variable                                                                  |
| `data` for values only used in `run`                  | Inline the value directly                                                                    |
| Testing spread/merge behavior                         | That's testing JavaScript, not your function                                                 |
| `args: [1, 2, 3]` when function expects one array     | Use `arg: [1, 2, 3]` — `args` spreads elements as separate arguments                         |
| `run (value)` or `run (input)` instead of `run (arg)` | Name the parameter `arg` — it mirrors the test property and signals the declarative contract |
