# AEGIS tracked scenarios and Playwright coverage

**Continuing the test work? Read the [resume handoff](RESUME.md) first** for the
last validated commit, next scenario batch, commands and unresolved reload issue.

Start with the [coverage report](coverage.md). It links every scenario family,
shows the percentage with a complete reviewed Playwright mapping, and lists every
discovered browser test and registered UI/HTTP surface. The machine-readable
[summary](coverage-summary.json) contains the same counts for dashboards or CI.

Executed results and defect-detection evidence for the latest coverage additions
are recorded in the [sixty-percent validation note](runs/2026-10-25-sixty-percent-coverage.md).
The [expanded coverage](runs/2026-10-24-expanded-coverage.md),
[position](runs/2026-10-24-positions.md) and
[earlier behavior](runs/2026-10-24-behavior.md) records preserve prior evidence.

The [scenario catalog](scenario-catalog.json) is the editable source of truth.
Generated scenario chapters live in [scenarios/](scenarios). The existing
[browser behavior guide](../../src/tests/playwright/README.md) explains fixtures,
assertions and how to run the application tests.

## What the percentage means

**Scenario mapping coverage = mapped scenarios / Playwright-eligible scenarios.**
Each scenario counts once, regardless of how many tests, assertions, retries or
browsers implement it. P0 coverage uses the same formula restricted to critical
scenarios. This is an unweighted inventory metric, not JavaScript line coverage,
a test pass rate, or a probability that the application has no defects.

| Status   | Meaning                                                                                                                                                         | Percentage credit                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Mapped   | Reviewed test assertions implement this row's bounded action and expected outcome; exact test references resolve in Chromium discovery.                         | One scenario                                         |
| Partial  | There is related Playwright evidence, but some required outcome, fixture, state or boundary is missing. The row explains the limitation.                        | Zero                                                 |
| Gap      | No complete Playwright implementation is assigned.                                                                                                              | Zero                                                 |
| External | An operational drill or diagnostic classification requires separate evidence outside browser scenario acceptance. Only the operations area can use this status. | Shown separately; outside the Playwright denominator |

“Mapped” requires a human review of assertions and fixture setup. The checker
validates test identity, discovery, static skip/fixme/fail status, catalog shape
and generated-file freshness. It cannot determine whether an assertion proves
the intended behavior, detect a helper that returns early at runtime, or replace
an executed browser run. Changing a test body without changing its title still
requires reviewing the mapping. Unit and Vitest browser tests are listed as
supporting evidence and receive no Playwright scenario credit.

The inventory is intentionally broader than the current test suite. It includes
normal operation, invalid input, Save/Cancel/confirmation, empty and missing data,
scope and identity, reload, multiple clients, concurrency, disconnect/reconnect,
permissions, version variants and operational recovery. A composite scenario is
mapped only when **all** of its stated checks are implemented. Keep scenarios at
a useful bounded contract size; split a row when the state matrix needs separate
tests and review, rather than padding the numerator with individual assertions.

P0 means a failure can corrupt/lose mission data, violate access/identity/scope,
misrepresent critical execution/science/calculation results, or prevent a core
workflow. P1 covers significant user behavior and validation; P2 covers secondary
presentation and preferences. Priorities are reviewable product judgments.

## Scope and provenance

The first review was on **2026-10-24** against this working tree, including the
recent action, comparison-report and collaboration tests. The report discovers
the checked-out tests rather than claiming results for a historical commit.
Rebuilding the report does not advance the semantic review date. Record the
reviewed commit alongside runtime results when accepting a release.

The structure follows the recent sibling MaestroPlus review:

- [Whole-app review coverage map](../../../maestroplus/docs/verification/reference/27-review-coverage-map.md)
  supplies the application-family checklist and distinction between registration
  accounting and acceptance.
- [Preservation scenarios](../../../maestroplus/docs/verification/reference/12-preservation-scenarios.md)
  supplies additional map, calculation, document and integration boundaries.
- [AEGIS sequence and lifecycle review](../../../maestroplus/docs/11-aegis-planning-entities.md),
  [execution policies](../../../maestroplus/docs/14-aegis-execution.md), and
  [data and administration](../../../maestroplus/docs/16-aegis-data-and-administration.md)
  informed the missing workflow families.

Those sibling documents are historical research inputs, not proof of this
checkout's behavior. The local catalog records current implementation sources
for every area. Expectations requiring policy clarification or an independent
scientific oracle stay as gaps; source-derived behavior is not automatically an
approved product requirement. Sibling links require both repositories to be
checked out side by side; the AEGIS catalog/report work independently.

The surface appendix inspects current TypeScript registrations: all UI routes,
mission-pane selectors, and mounted literal HTTP routes. Each is assigned to a
scenario family, including administration and diagnostics. Assignment is an
accounting check, not test coverage. Sockets, conditionally rendered controls,
GIS tools and operational scripts are represented by the broader family review;
the registration scanner does not exhaust their possible behavior. A family can
have complete registration accounting and zero mapped scenarios.

The catalog is a finite, extensible denominator. New features and discovered
states must add scenarios even if that lowers the percentage. Do not delete,
merge, downgrade or classify a browser scenario as external to reach 100%.
Document removals or scope changes with the corresponding product change.

## Maintain and regenerate

```sh
# Validate catalog, current discovery and checked-in generated artifacts.
npm run test:playwright:scenarios

# Rebuild the report, per-area chapters and machine-readable summary.
npm run docs:playwright-scenarios

# Future closure gate: fails until every eligible row has a complete mapping.
npm run test:playwright:scenarios:complete
```

These commands run `playwright --list`, not browser execution, global setup or
the application/database. They use the installed project dependencies and need
no operational mission data. Normal validation succeeds with honestly recorded
gaps; the completeness gate is intentionally stricter and currently fails.
No existing CI/deployment job is changed to require full coverage.

To add or close a scenario:

1. Edit `scenario-catalog.json`. Preserve existing IDs; allocate the next unused
   ID under the appropriate area. Do not renumber rows when inserting one.
2. Specify fixture, user action and independently checkable expected outcomes.
   Add a per-scenario `fixture` when a case needs a more specific setup than its
   area's default. Describe relevant state boundaries in the action/expectation.
3. Add exact test-relative `file` and expanded `title` references. Parameterized
   titles must match actual `--list` discovery. The checker rejects missing,
   ambiguous, excluded or statically skipped complete mappings.
4. Review the real assertions and setup. Keep a row Partial if a related test only
   checks visibility, download filename, imported optional data or one state of
   a larger contract. Explain the unproved boundary in `note`.
5. Generate docs and validate. Run the actual affected browser tests separately,
   preserving result files and recording the reviewed commit/configuration.

Source paths in `sources` and `supporting` are checked for existence. Add new
route/pane or mounted-handler assignments to `surfaceAssignments` when required.
Every existing route in a handler belongs to its assigned family, but a newly
added endpoint still needs a semantic scenario review even if that family was
already assigned. Generated discovery includes supporting tests that have no
complete scenario mapping, so they remain visible without inflating the score.

## Before claiming complete coverage

The mapping gate must pass with no Partial or Gap rows. Then execute all required
browser projects against the reviewed commit with explicit fixtures, and retain
results showing which cases passed, failed, skipped or retried. Current Firefox
and WebKit configuration covers the small smoke set; comprehensive cross-browser
editing remains a separate tracked gap. A successful Chromium run cannot close
that gap.

Check that tests fail when their targeted behavior is broken. Execute external
restore, migration, deployment, GIS and load drills with their own oracles and
records. Review the denominator again for missing capabilities and states.
Only those combined records support an acceptance claim; a generated percentage
or a green test count alone does not.
