# Test selection and CI layout

Use the [test-writing directive](../../CLAUDE.md#writing-tests-fixtures-and-runner-choice)
and [mission browser fixture guide](../../src/tests/vitest-browser/behavior/README.md)
when adding coverage. Client workflows belong in Vitest Browser Mode; Playwright
checks retain the real authentication, persistence, peer, socket, recovery and
download boundaries.

## Jobs

| Job                               | Scheduling                                  | Scope                                                                                        | Reports                                   |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `test-vitest`                     | Three automatic shards                      | Existing unit/server tests                                                                   | Three Node coverage blobs                 |
| `test-vitest:browser:chromium`    | Six automatic shards, one worker each       | Every browser test in Chromium and Chromium high-DPI, with V8 coverage                       | Distinct coverage blobs and JUnit reports |
| `test-vitest:browser:nonChromium` | One automatic job, one worker               | A smaller set of the Chromium tests in Firefox/WebKit, standard and high-DPI (`parityFiles`) | Separate JUnit report                     |
| `merge-vitest-coverage`           | After every Node and browser coverage shard | Combined coverage and Node test results                                                      | Node JUnit, combined Cobertura and LCOV   |
| `test-playwright`                 | Four shards after `test-playwright:start`   | All configured end-to-end projects                                                           | Playwright diagnostics and reports        |

`test-vitest:browser:nonChromium` targets the workflows most likely to behave
differently across browser engines, such as map gestures, canvas, layout and
keyboard/focus behavior. The file list is `parityFiles` in
`src/tests/vitest-browser/vitest.config.mts`.

Authentication setup runs as a dependency in each Playwright shard. Use the
configured tests (`vitest list`, `playwright test --list`) to discover the current
inventory rather than maintaining a second list of scenarios or test counts.

Reassess shard allocation when workloads change. Benchmark comparable workflows
with consistent worker counts and recorded cache conditions, then check actual
GitLab critical-path timings, including database preparation, runner queueing and
artifact transfers. Keep run-specific measurements in CI artifacts or the MR
rather than this guide.

High-DPI Chromium remains in the same shard selection, preventing accidental
omission. `test-vitest:browser:nonChromium` stays independent because V8 coverage
requires Chromium's CDP. It allows 120 seconds for each browser session to connect on shared
runners. This startup allowance does not change test timeouts. Its
`vitest:browser:pool`, `vitest:browser:playwright` and `pw:browser` debug logs record
session scheduling and browser launches so connection failures can be
distinguished from test failures.

## Coverage and deployment integrity

Node blobs are named `blob-node-<index>-3.json`; browser blobs are named
`blob-browser-<index>-6.json`. The coverage merge requires all nine nonempty files.
Only blob JSON goes in `.vitest-reports/`. Browser shards publish distinct JUnit
files at `test-results/vitest-browser-<index>-6.xml`; `test-vitest:browser:nonChromium`
uses `test-results/vitest-browser-parity.xml`.

The jobs set both blob output paths and `--merge-reports=.vitest-reports`
explicitly; Vitest 5's default blob directory is `.vitest/blob/`.

The merge uses the Node configuration and a Node-only JUnit reporter. Vitest 5
replays browser modules during merging even when those projects are absent from
the configuration. The reporter excludes those modules from JUnit to avoid
duplicating the results published by the browser jobs; their coverage still
contributes to the combined report.

The browser JUnit reporter prefixes testcase classes with the browser project.
Vitest's default omits it, giving Firefox and WebKit identical identities that
GitLab would deduplicate. [GitLab report requirements](https://docs.gitlab.com/ci/testing/unit_test_reports/#test-results-are-missing)

GitLab downloads artifacts from every instance of a parallel job named in
`needs`; colliding file paths can overwrite earlier artifacts. Distinct blob
paths preserve every shard's data. [GitLab reference](https://docs.gitlab.com/ci/yaml/#needs)
Vitest's blob reporter embeds coverage and supports replay through
`--merge-reports`, so the merge needs neither browsers nor a database.
[Vitest reference](https://vitest.dev/guide/reporters#blob-reporter)

`docker:retag` waits for merged coverage, all `test-vitest:browser:chromium` shards
and `test-vitest:browser:nonChromium`, along with its other required checks. Development retagging keeps its
existing policy. Automatic browser jobs have no dependency on the manual
Playwright launch. Playwright remains required before merge readiness: trigger
the launch and wait for all four shards for the exact candidate commit.

When changing this layout, keep matrix entries, shard totals, blob paths, merge
guards, deployment gates, `CLAUDE.md` and the MR checklist synchronized. An old
pipeline result does not validate a new commit.

## Validating layout changes

Run `npm run test:all` and affected Playwright checks. Keep browser project
identities in JUnit and confirm in the pipeline that every shard's coverage
survives the merge. Record the
tested commit, commands, results and retries in the MR description. Store raw
logs and generated reports in CI artifacts or ignored local directories.

Local checks validate the configuration. GitLab pipeline
performance and merge-readiness gates require the actual candidate pipeline;
local checks do not replace the manual four-shard launch.
