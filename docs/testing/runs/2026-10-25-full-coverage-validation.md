# Full Playwright coverage validation

Validation date: **2026-10-25**. The reviewed working tree has **253/253
eligible scenarios mapped (100%)**, including **146/146 P0 scenarios**. All 260
catalog entries remain: 253 mapped, zero partial, zero gaps and seven external.
External operational drills are outside the Playwright denominator. Mapping
coverage is a reviewed scenario inventory measure, not JavaScript line coverage.

`npm run docs:playwright-scenarios` regenerated the catalog report and
`npm run test:playwright:scenarios:complete` passed: 81/81 registered surfaces,
zero partial mappings and zero gaps. The generated report's “browser tests
executed: 0” refers only to its discovery and report-generation process; the
separate full execution result is below.

## Full browser run

Command: `npm run test:playwright`, with no file, project, grep or shard filters.
The configured auth, Chromium, Firefox and WebKit projects ran against the
current working tree on Windows using the default three workers.

| Project | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Auth | 1 | 0 | 0 |
| Chromium | 477 | 0 | 0 |
| Firefox | 37 | 0 | 0 |
| WebKit | 37 | 0 | 0 |
| **Total** | **552** | **0** | **0** |

The run exited 0 in **17m 28s** (1,047.578 seconds). Playwright recorded zero
retries, flaky or unexpected results, skips or errors; each of 552 cases had one
result. The matching JUnit report recorded 552 passed and no failures, skips or
errors.

Retained artifacts:

- [Playwright HTML report](../../../.local/coverage100/full-final-report/index.html)
- [Machine-readable run summary](../../../.local/coverage100/full-final-summary.json)
- [Full run log](../../../.local/coverage100-full-final.log)
- [JUnit report](../../../.local/coverage100/full-final-report/junit.xml)
- [Chromium Windows socket stress log](../../../.local/coverage100-windows-socket-focus.log)

The standard static gate also passed: lint, TypeScript, frontend/API build,
**2,124 unit tests** and **399 browser component tests**. See
[test-all log](../../../.local/test-all-chromium-workaround.log).

## Windows Chromium loopback issue

An earlier three-worker full run completed 550/552; two cases failed during
mission page hydration before their behavior assertions. Trace review found
intermittent Chromium `ERR_NO_BUFFER_SPACE` failures on local loopback requests
with Chromium 153.0.8010.12 on Windows. The error matches the Chromium issue
[572515601](https://issuetracker.google.com/issues/572515601), which identifies
`TcpPortRandomizationWin` as the cause.

Playwright 1.63 already supplies 15 disabled Chromium features. Its last
`--disable-features` switch replaces the previous feature list, so the
Windows-only workaround in the Playwright config preserves those 15 defaults
and adds `TcpPortRandomizationWin`. Other operating systems receive no added
argument. The actual Chromium launch arguments were checked, and a three-worker
stress run passed **13/13** cases with the workaround. The final full run above
then passed with the normal three-worker setting.

## Scope limits

The full run executes every configured project and test. Firefox and WebKit
include the configured smoke and selected parity workflows; they do not run all
Chromium behavior cases. Seven operational scenarios remain external to
Playwright by design. The 100% figure is the reviewed mapping of eligible
scenarios and does not claim line coverage or exhaustive state coverage.
