# Headless (Playwright)

Headless mode runs your existing JS-first tests inside a real browser engine (Chromium, Firefox, WebKit) while keeping hTest's Node output and reporting. This is useful when tests rely on browser APIs that don't exist in Node, or when you want parity with real rendering/JS engines without changing how results are displayed.

## Why use it

- Run browser-only tests (DOM APIs, layout, canvas) without rewriting your suite.
- Keep the same CLI output and interactive UI you get in Node.
- Choose the browser engine explicitly to match your target environment.
- CI/CD-friendly.

## Install

Headless runs are opt-in and require Playwright:

```bash
npm i -D playwright
npx playwright install chromium
```

## Usage

Run tests in the default headless browser (Chromium):

```bash
npx htest --headless path/to/tests
```

Choose a browser engine:

```bash
npx htest --headless --browser firefox path/to/tests
```

Supported values: `chromium`, `firefox`, `webkit`, `chrome`, `edge`.

## CI/CD

Use `--ci` to disable interactive mode:

```bash
npx htest --headless --ci path/to/tests
```

## Notes

- This runner executes JS-first tests only.
- Results are still rendered by the Node CLI UI.
