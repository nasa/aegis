# Test selection and CI layout

Use the [test-writing directive](../../CLAUDE.md#writing-tests-fixtures-and-runner-choice)
and [mission browser fixture guide](../../src/tests/vitest-browser/behavior/README.md)
when adding coverage. Client workflows belong in Vitest Browser Mode; Playwright
checks retain the real authentication, persistence, peer, socket, recovery and
download boundaries.

## Jobs

| Job                          | Scheduling                                         | Scope                                            | Reports                                   |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| `test-vitest`                | Three automatic shards                             | Existing unit/server tests                       | Three Node coverage blobs                 |
| `test-vitest:browser`        | Three automatic shards, at most three workers each | Chromium and Chromium high-DPI, with V8 coverage | Distinct coverage blobs and JUnit reports |
| `test-vitest:browser:parity` | One automatic job, at most three workers           | Firefox/WebKit, standard and high-DPI            | Separate JUnit report                     |
| `merge-vitest-coverage`      | After every Node and browser coverage shard        | Combined coverage and Node test results          | Node JUnit, combined Cobertura and LCOV   |
| `test-playwright`            | Four shards after `test-playwright:start`          | All configured end-to-end projects               | Playwright diagnostics and reports        |

The migration reduced Playwright discovery from 564 checks to 246. Four shards
now distribute about 61 application checks each, compared with about 70 per
shard before the migration's eight-shard layout. Each shard still needs its own
database, restore and migrations; reducing the count avoids four copies of that
setup. Authentication setup runs as needed in every shard.

Chromium browser coverage has 706 checks across 105 test-file/project pairs,
while the other browser engines have 48 parity checks. Three coverage shards
distribute those files without duplicating the parity run. High-DPI Chromium is
included in the same shard selection so it cannot be omitted accidentally.
Parity runs independently because V8 coverage requires Chromium's CDP.

These are starting allocations based on the new workload and local timings.
Runner CPU, coverage overhead, artifact transfers and database setup affect the
actual GitLab critical path. Check the slowest shard and runner queue after the
first real pipeline before tuning further.

## Coverage and deployment integrity

Node blobs are named `blob-node-<index>-3.json`; browser blobs are named
`blob-browser-<index>-3.json`. The coverage merge requires all six nonempty files.
Only blob JSON goes in `.vitest-reports/`. Browser shards publish distinct JUnit
files at `test-results/vitest-browser-<index>-3.xml`; parity uses
`test-results/vitest-browser-parity.xml`.

The merge uses the Node configuration and publishes its Node JUnit results.
Vitest drops browser test results from JUnit when those projects are absent
from the merge configuration, even though their coverage is combined. Publishing
JUnit in each browser job preserves every result without starting browser
projects in the merge job.

The browser JUnit reporter prefixes testcase classes with the browser project.
Vitest's default omits it, giving Firefox and WebKit identical identities that
GitLab would deduplicate. [GitLab report requirements](https://docs.gitlab.com/ci/testing/unit_test_reports/#test-results-are-missing)

GitLab downloads artifacts from every instance of a parallel job named in
`needs`; colliding file paths can overwrite earlier artifacts. Distinct blob
paths preserve every shard's data. [GitLab reference](https://docs.gitlab.com/ci/yaml/#needs)
Vitest's blob reporter embeds coverage and supports replay through
`--merge-reports`, so the merge needs neither browsers nor a database.
[Vitest reference](https://vitest.dev/guide/reporters#blob-reporter)

`docker:retag` waits for merged coverage, all browser coverage shards and browser
parity, along with its other required checks. Development retagging keeps its
existing policy. Automatic browser jobs have no dependency on the manual
Playwright launch. Playwright remains required before merge readiness: trigger
the launch and wait for all four shards for the exact candidate commit.

When changing this layout, keep matrix entries, shard totals, blob paths, merge
guards, deployment gates, `CLAUDE.md` and the MR checklist synchronized. An old
pipeline result does not validate a new commit.

## Local validation of this layout

- Standard checks: lint, types, build, 2,325 unit tests and 754 browser tests.
- Real Chromium coverage runs: 35 files per shard; 263, 230 and 213 passing tests.
  The union includes all 105 file/project pairs and 706 tests exactly once.
- Separate Firefox/WebKit parity: 48 passing tests. Browser JUnit replay and
  parity execution preserve all 754 unique browser testcase identities.
- All six coverage blobs merge into Cobertura/LCOV with every input's covered
  lines preserved. Node JUnit retains all 2,325 unique testcase identities.
- Playwright discovery: 62, 61, 61 and 61 application checks, with no omitted or
  duplicated checks. This validates selection, not full end-to-end execution.
- Git Bash: merge/retry syntax checks pass; the artifact guard rejects each
  missing or empty blob and accepts all six nonempty blobs.

These checks validate the configuration locally. The four-shard Playwright run
and end-to-end pipeline timing still require the actual GitLab pipeline.
