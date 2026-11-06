# AEGIS functionality audits

Vitest Browser Mode and Playwright tests together form the executable scenario
baseline. Use AI to compare the application's supported functionality with the test fixtures and assertions,
then add or strengthen tests for missing behavior. Record the review scope and
remaining gaps in the MR description.

The [browser behavior guide](../../src/tests/playwright/README.md) explains
fixtures, independent expectations, local execution and the full CI procedure.
The [mission browser harness](../../src/tests/vitest-browser/behavior/README.md)
covers client workflows with real React, Redux, Automerge and OpenLayers, using
in-memory missions. Prefer that harness for client behavior. Use Playwright for
real authentication, REST/database persistence, sockets, multiple UI clients,
downloads, reload/recovery and selected browser parity. A harness remount proves
UI rehydration from the document; a Playwright reload proves the server boundary.
The [migration expansion record](browser-behavior-expansion-2026-11-06.md) lists
the current split, browser parity, measured runtime and retained integration checks.
The [CI layout](ci-layout.md) describes the current shard allocation, reports
and deployment gates.

## AI-assisted functionality audit

The main review question is whether the tests describe the application's
supported functionality and meaningful state boundaries. Passing tests show
that their assertions succeeded for a particular run. They cannot establish
that every supported capability has been identified.

An AI audit must first inventory functionality from application sources, then
compare that inventory with test fixtures and assertions. Starting only from
the tests or a previous audit risks overlooking the same missing capabilities
again. A lightweight audit record retains source areas inspected, identified
gaps, unresolved expectations, deliberate exclusions and browser-run evidence.
Covered behavior can link directly to tests without another prose description.

Use this prompt for a full audit. For a feature MR, replace the scope with its
base/head commits and changed capabilities, including their shared consumers.
A focused review must not be reported as a whole-application audit.

```text
Audit AEGIS's functional scenario completeness and its browser verification.

Read the repository instructions, src/tests/playwright/README.md and
src/tests/vitest-browser/behavior/README.md. Record the
reviewed commit and whether this is a full application audit or a scoped change.

1. Before using tests or a previous audit as a checklist, inspect the application
   implementation and build a capability inventory. Follow routes, panes and
   controls into shared operations, calculations, persistence, permissions,
   sockets and external integrations. Include behavior that route discovery
   cannot see. Record source evidence and any areas not inspected.

2. For each capability, identify its supported actions and meaningful boundaries:
   creation/edit/deletion, validation, Save/Cancel where offered, empty/missing
   data, identity/ownership, planned/running/historical state, permissions,
   persistence/reload, peer updates, concurrency and failure/recovery. Select
   applicable boundaries; do not invent a Cartesian product or new requirements.
   Separate observed implementation from confirmed intended behavior. Flag
   ambiguous expectations for product review instead of treating current bugs
   as the specification.

3. Discover Vitest browser and Playwright tests and read their actual fixtures, actions and
   assertions, including helpers and runtime branches. Compare them against the
   independently derived inventory. A matching title, visible canvas or passing
   test is insufficient if the required outcome is not asserted. Identify
   missing capabilities and partially verified boundaries, skipped/conditional
   work, weak or circular expected values, and missing browser parity where
   relevant. Revisit unresolved findings from previous audits without assuming
   they exhaust the app's functionality.

4. Add or strengthen tests for clear supported contracts using isolated data,
   real user actions and independently known expectations. Verify persistence
   and peer behavior when required by the contract. Retain defect reproducers
   and demonstrate that their targeted regression causes failure when feasible.
   Do not change product behavior merely to satisfy an unsupported expectation,
   weaken assertions to obtain green results, or hide missing coverage with skips.
   Record unresolved contracts as explicit gaps.

5. Run the affected tests and follow the repository's required validation rules
   for code changes. Report the tested commit, configuration, commands, passes,
   failures, retries and skips. Distinguish assertion review from browser
   execution. Follow the full CI acceptance procedure before claiming merge
   readiness.

6. Produce a concise audit record: reviewed scope/commit, source areas inspected,
   gaps found and addressed with test links, remaining partial/missing scenarios,
   unresolved expectations, exclusions with reasons, and execution evidence.
   Use test references for covered behavior instead of copying every test into
   another scenario catalog. For a scoped audit, update the affected findings
   and preserve unresolved findings outside its scope. Never infer functional
   completeness from a percentage or test count. State limitations explicitly.
```

For ongoing feature work, run a scoped audit in the same MR. Use full audits when
reassessing the baseline or before a significant release. AI produces the review
and proposed changes; maintainers assess its scope, product assumptions and
assertions. A new gap is useful evidence and must remain visible until resolved.

## Recording an audit

Include this concise record in the MR description. Link to tests for covered
behavior rather than maintaining a second description of every scenario. Do not
mark a source area reviewed until it has actually been inspected. Carry unresolved
findings into follow-up issues or the next audit, with a link from the MR.

```text
Reviewed commit or base/head commits:
Scope: full application or named changed capabilities
Implementation areas inspected and source references:
Gaps addressed and test references:
Remaining missing/partial scenarios and follow-up links:
Unresolved intended behavior:
Deliberate exclusions and rationale:
Executed validation: commit, configuration, commands, results, retries/skips
Areas not inspected or other limitations:
```

Review both assertions and fixture setup. Use bounded contracts with independently
checkable outcomes, and distinguish supported product requirements from current
implementation behavior. Unit/component tests can supply additional evidence;
real browser execution establishes that the application pieces work together.

Operational work such as backup/restore, migrations, deployment, GIS conversion
and load/long-session drills may need separate evidence. Describe those boundaries
when they affect the reviewed capability rather than treating browser passes as
operational acceptance.

Discover current configured tests without running browsers:

```sh
node node_modules/@playwright/test/cli.js test --config=src/tests/playwright/playwright.config.ts --list
```

Discovery supplies test identities and configured projects; it does not evaluate
assertion sufficiency or establish runtime results. Run affected tests during
development and all four Playwright CI shards for the candidate commit before merge, as
described in the browser behavior guide.
