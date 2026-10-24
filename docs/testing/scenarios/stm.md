# Legacy STM and v2 satisfaction rules

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Explicit v1 hierarchy and v2 definitions/rules using small known action tuples with enabled/disabled and duplicate matches.

Source: [src/components/panes/stm-legacy/stm-legacy-viewer-page.tsx](../../../src/components/panes/stm-legacy/stm-legacy-viewer-page.tsx), [src/components/panes/stm-rules/stm-rules-page.tsx](../../../src/components/panes/stm-rules/stm-rules-page.tsx).

Scenario mapping: **0/6 (0%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/stmRules_thunk.test.ts](../../../src/tests/vitest/store/thunks/stmRules_thunk.test.ts), [src/tests/vitest/utils/stmEvaCoverage.test.ts](../../../src/tests/vitest/utils/stmEvaCoverage.test.ts).

## STM-001: Legacy hierarchy and action priorities

**P0 · Gap**

Action: In v1 load/edit supported STM levels and set/clear H/M/L coverage on actions.

Expected: Hierarchy, mini coverage strips, severity and persisted per-action coverage agree without cross-version leakage.

## STM-002: Legacy STM filtering and execution colors

**P1 · Gap**

Action: Filter/select STM cells with enabled/disabled and executed/skipped action fixtures.

Expected: Coverage counts, highlights and status colors use the correct plan/REX and omit excluded actions.

## STM-003: Satisfaction rule CRUD and validation

**P0 · Gap**

Action: In v2 create/edit/duplicate/delete rules with definition references; cancel and reload.

Expected: Required and invalid combinations are handled, saved rule identities are independent and referencing definitions remain protected.

## STM-004: Rule tuple matching and thresholds

**P0 · Gap**

Action: Use exact verb/noun/adjective tuples, wildcard/missing categories and threshold boundaries.

Expected: Known satisfied/unsatisfied counts agree with the rule semantics; duplicate and disabled actions are handled explicitly.

## STM-005: Rule ordering layout and persistence

**P2 · Gap**

Action: Reorder/resize supported rule columns and navigate/reload.

Expected: Persisted and local layout settings follow their intended scope without changing rule meaning.

## STM-006: Rule collaboration and dangling references

**P0 · Gap**

Action: Edit/delete rules and referenced definitions from two clients.

Expected: Clients converge with valid references and matching coverage without stale rule editor selections.
