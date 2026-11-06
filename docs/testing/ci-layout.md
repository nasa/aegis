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

The completed migration leaves **137 Chromium, 13 Firefox and 13 WebKit
application scenarios**, plus authentication setup, compared with 211/17/17
plus setup at `9b02e21f`. Four shards select **41, 41, 41 and 40** application
checks without omissions or duplicates. Authentication runs as a dependency in
each shard. Every retained file has a specific integration requirement in the
[completion index](browser-runner-completion-2026-11-06.md#remaining-playwright-index).

Chromium browser coverage now has **809 tests across 149 file/project pairs**;
the Firefox/WebKit standard/high-DPI parity job has **60 tests across 18 pairs**.
The three coverage shards execute **50/50/49 pairs and 301/271/237 tests**.
Node shards execute **57/57/56 files and 665/757/903 tests**.

The allocation was reassessed and remains three browser coverage shards and four
Playwright shards. Local Chromium coverage shards took **137.35, 142.56 and 96.14
seconds**, with three workers, fresh separate optimizer caches, and a concurrent
Playwright run. They fit comfortably within the 20-minute job budget. The larger
native workload makes three coverage shards useful; the remaining longer
socket, permission, raster and restart checks still warrant four integration
shards. Job database/restore overhead, CPU, queueing and artifact transfers need
actual GitLab critical-path evidence before reducing these counts. The measured
local representative workflow improvement is documented in the completion record;
it is not a measured pipeline speedup.

High-DPI Chromium remains in the same shard selection, preventing accidental
omission. Parity stays independent because V8 coverage requires Chromium's CDP.

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

- Browser coverage: all 149 selected file/project pairs and 809 tests executed
  exactly once. Firefox/WebKit parity: all 18 pairs and 60 tests passed.
- Node coverage: all 170 selected files and 2,325 tests executed exactly once.
- All six nonempty coverage blobs replay into JSON, Cobertura and LCOV. The
  merged covered-line set equals the union of every input: **20,334 lines**.
  LCOV and Cobertura preserve that same covered-line set.
- JUnit retains all **3,194 distinct executed testcase identities**: 2,325 Node
  plus 869 browser. Identity sets are compared with recursive executed blob
  tasks, including a separate parity blob; this detects missing passing results
  as well as duplicate browser identities.
- Every missing/empty blob and a dropped passing JUnit testcase were rejected;
  restored artifacts passed.
- Playwright discovery selects 41/41/41/40 application checks exactly once.
  Selection evidence is separate from full integration execution; see the
  completion record for final execution and retry details.

Reproduce selection without starting servers or browsers:

```sh
node .gitlab/scripts/verify-test-shards.mjs .local/migration/layout
```

Vitest `list --filesOnly` does not apply `--shard`; this checker uses Vitest's
own `BaseSequencer` for selection and checks actual blob execution separately.
Playwright dependency setup is excluded only from application partition checks.

The artifact checker consumes a local evidence directory with six blobs under
`blobs/`, each shard's JSON coverage under `coverage-node-<index>/` or
`coverage-browser-<index>/`, merged JSON under `coverage-merged/`, and JUnit files
`junit-node.xml`, `junit-browser-<index>.xml`, `junit-parity.xml`. Store parity's
blob as `parity-blob.json` outside the six coverage inputs. Run the selection
checker above into its `layout/` subdirectory first. Emit shard JSON with
`--coverage.reporter=json --coverage.reportsDirectory=<unique-directory>`;
retain the CI blob/JUnit reporter arguments shown in the job definitions.

```sh
npx vitest --merge-reports=.local/migration/blobs \
  --config src/tests/vitest/vitest.config.mts --coverage \
  --coverage.reportsDirectory=.local/migration/coverage-merged \
  --coverage.reporter=json --coverage.reporter=lcov --coverage.reporter=cobertura \
  --reporter=junit --outputFile.junit=.local/migration/junit-node.xml
node .gitlab/scripts/verify-vitest-artifacts.mjs .local/migration
```

These checks validate the configuration and artifacts locally. Final GitLab
pipeline performance and merge-readiness gates require the actual candidate
pipeline; local checks do not replace the manual four-shard launch.
