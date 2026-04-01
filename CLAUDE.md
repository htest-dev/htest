# hTest

Declarative JS testing framework. Two modes: **JS-first** (logic, Node/browser, CI) and **HTML-first** (UI, browser only).
Package: `htest.dev` | Repo: https://github.com/htest-dev/htest | Site: https://htest.dev

## Commands

| Command | Purpose |
|---|---|
| `npm test` | Run full test suite (self-hosted — hTest tests itself) |
| `npx htest tests/check.js` | Run a single test file |
| `npm run eslint` | Lint |
| `npm run eslint:fix` | Lint and auto-fix |
| `npm run build` | TypeDoc (API docs) + Eleventy (docs site) |
| `npm run dev` | Eleventy dev server for docs site |
| `npm run release` | Publish via release-it |

No Prettier, no EditorConfig — ESLint only (`eslint.config.js`).

## Architecture

```
src/
  index.js              Main exports: Test, TestResult, map, check, render, env
  cli.js                CLI entry: arg parsing, config file discovery, calls run()
  run.js                Environment-agnostic runner: resolves env, creates Test + TestResult
  check.js              Assertion library: equals, subset, proximity, deep, range, and/or
  map.js                Value extraction utilities (extract, extractNumbers, trimmed)
  format-console.js     ANSI formatting with custom HTML-like tag syntax
  render.js             Browser-side: renders JS-first tests as HTML reftest tables
  hooks.js              Generic extensibility hooks singleton
  content.js            DEPRECATED — re-exports equals from check.js with warning
  util.js               General utilities (stringify, getType, interceptConsole, etc.)
  objects.js            Object utilities (children, walk, clone, join)
  classes/
    Test.js             Test tree: property inheritance, structure, auto-naming
    TestResult.js       Execution, evaluation, output formatting, event-driven stats
    BubblingEventTarget.js  EventTarget subclass with bubbling support
  env/
    node.js             Node env: file resolution, interactive CLI tree, CI mode
    console.js          Browser console env (console.group output)
    auto.js             Auto-detects Node vs browser
```

### Key data flow

1. `cli.js` parses args + finds config (`{,_,.}htest.{json,config.json,config.js}`), calls `run()`
2. `run.js` resolves env string → module, resolves file paths → test objects, creates `Test` tree then `TestResult`
3. `Test` constructor handles property inheritance (parent before children) + converts `check` objects to functions
4. `TestResult.runAll()` runs siblings in parallel via `Promise.allSettled`, fires `start`/`done`/`finish` events
5. `env/node.js` renders the interactive ASCII tree via oo-ascii-tree + log-update; exits with code 1 in CI mode

### Inherited test properties

These cascade from parent to child (set in `Test.js` constructor):

```
beforeEach  run  afterEach  map  check  getName  args  expect  getExpect  throws  maxTime  maxTimeAsync  skip
```

NOT inherited: `beforeAll`, `afterAll`, `name`. `data` is merged (child extends parent), not replaced.

## Self-hosted testing

hTest tests itself. All test files in `tests/` use hTest's own declarative format.
`tests/index.js` auto-discovers every `.js` file in its directory (excluding `index*.js`) — no registration needed when adding new test files.

## Project-specific conventions

- `*.html` and `api/` are gitignored — both are generated (Eleventy and TypeDoc respectively)
- `htest.js` at the project root is the **browser entry point** for HTML-first mode — it is not an ES module
- `src/render.js` imports from `https://html.htest.dev/` — these are live CDN URLs, not local paths

## Package exports

```
htest.dev          →  src/index.js
htest.dev/check    →  src/check.js
htest.dev/map      →  src/map.js
htest.dev/env      →  src/env/index.js
```

## SKILL.md maintenance

`SKILL.md` is the AI agent reference for writing tests **with** hTest. It ships in the npm package and is critical for AI agent integrations.

**Rule: whenever a change affects the testing API or behavior, update `SKILL.md` to reflect it.**

Files that require a SKILL.md review when changed:

| File | What to check in SKILL.md |
|---|---|
| `src/classes/Test.js` | Property inheritance list, `arg` vs `args`, `check` object shorthand, `data` merge behavior |
| `src/classes/TestResult.js` | Lifecycle hooks, parallel execution behavior, `throws` semantics |
| `src/check.js` | Available check functions and their options |
| `src/map.js` | Available map utilities |
| `src/run.js` | Runner behavior, env resolution |
| `src/cli.js` | CLI flags and config file discovery |
