# Change Log

## v0.0.20 (2025-10-14)

### Bug fixes

- Fix regression when all failed tests were shown as skipped by @DmitrySharabin in d4f8cbda57c5793912188b9681131918a0501fc6

**Full Changelog**: https://github.com/htest-dev/htest/compare/v0.0.19...v0.0.20

## v0.0.19 (2025-06-19)

### Improvements

- Support verbose output in CI/CD; allow enabling verbose output via a CLI argument by @DmitrySharabin in #97
- Don't format skipped tests as failed by @DmitrySharabin in #97
- Stringify intercepted messages before printing them out, so we don't get `[object Object]` when printing out objects by @DmitrySharabin in #99

### Bug fixes

- Respect the `verbose` option when printing out results by @DmitrySharabin in #97
- In CI/CD, don't exit with an error if there are none by @DmitrySharabin in #98

**Full Changelog**: https://github.com/htest-dev/htest/compare/v0.0.18...v0.0.19

## v0.0.18 (2025-06-12)

### API changes

- Allow writing tests without `arg` or `args` by [@DmitrySharabin](https://github.com/DmitrySharabin) and [@LeaVerou](https://github.com/LeaVerou) in [#57](https://github.com/htest-dev/htest/pull/57)
- Add lifecycle hooks (`beforeAll`, `beforeEach`, `afterEach`, and `afterAll`) to support setup and teardown by @DmitrySharabin and [@LeaVerou](https://github.com/LeaVerou) in [#65](https://github.com/htest-dev/htest/pull/65), [#67](https://github.com/htest-dev/htest/pull/67), and [#68](https://github.com/htest-dev/htest/pull/68)
- Make `throws`, `maxTime`, and `maxTimeAsync` inheritable by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#79](https://github.com/htest-dev/htest/pull/79)
- Add support (via `throws: false`) for tests that should pass with any result if they don't throw by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#77](https://github.com/htest-dev/htest/pull/77)
- Add support for generated expected values via `getExpect()` by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#84](https://github.com/htest-dev/htest/pull/84)

### Improvements

- Better failure display: colored diffs, dimmed unmapped values, inline or vertical alignment of actual and expected values by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#59](https://github.com/htest-dev/htest/pull/59)
- Better CI integration by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#60](https://github.com/htest-dev/htest/pull/60)
- Tests which `map()` or `check()` function errors are now considered as failed by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#61](https://github.com/htest-dev/htest/pull/61)

### Bug fixes

- When tests run in the browser, console messages are no longer intercepted by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#70](https://github.com/htest-dev/htest/pull/70)
- Fix bugs with time-based and error-based tests by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#82](https://github.com/htest-dev/htest/pull/82)
- Don't mix up intercepted console messages between tests when running in Node by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#85](https://github.com/htest-dev/htest/pull/85)

### HTML mode

hTest HTML now lives in its own [repo](https://github.com/htest-dev/htest-html) and has its own [website](https://html.htest.dev/) (by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#90](https://github.com/htest-dev/htest/pull/90) and [#91](https://github.com/htest-dev/htest/pull/91)). It also got some noticeable improvements and bug fixes:

- Expose colored diffs to the HTML mode by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#63](https://github.com/htest-dev/htest/pull/63)
- Totals are now correctly updated on tests run by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#66](https://github.com/htest-dev/htest/pull/66)
- Better rendering of nested objects by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#69](https://github.com/htest-dev/htest/pull/69)
- Skipped tests are now correctly rendered and counted by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#71](https://github.com/htest-dev/htest/pull/71)
- Fixed test isolation and the navigation between individual tests by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#72](https://github.com/htest-dev/htest/pull/72)
- In case of an error, the error details will be rendered (by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#73](https://github.com/htest-dev/htest/pull/73)), and the error stack is logged to the console on click (by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#81](https://github.com/htest-dev/htest/pull/81))

### Website and API docs improvements

- Modernize the website styles + new logo by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#87](https://github.com/htest-dev/htest/pull/87)
- Add logo, favicon, and nav links to the API docs by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#58](https://github.com/htest-dev/htest/pull/58) and [#93](https://github.com/htest-dev/htest/pull/93)
- Fix types by [@DmitrySharabin](https://github.com/DmitrySharabin) in [#89](https://github.com/htest-dev/htest/pull/89)

**Full Changelog**: [v0.0.17...v0.0.18](https://github.com/htest-dev/htest/compare/v0.0.17...v0.0.18)
