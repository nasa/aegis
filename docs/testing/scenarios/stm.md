# Legacy STM and v2 satisfaction rules

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: Explicit v1 hierarchy and v2 definitions/rules using small known action tuples with enabled/disabled and duplicate matches.

Source: [src/components/panes/stm-legacy/stm-legacy-viewer-page.tsx](../../../src/components/panes/stm-legacy/stm-legacy-viewer-page.tsx), [src/components/panes/stm-rules/stm-rules-page.tsx](../../../src/components/panes/stm-rules/stm-rules-page.tsx).

Scenario mapping: **6/6 (100%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest/store/thunks/stmRules_thunk.test.ts](../../../src/tests/vitest/store/thunks/stmRules_thunk.test.ts), [src/tests/vitest/utils/stmEvaCoverage.test.ts](../../../src/tests/vitest/utils/stmEvaCoverage.test.ts).

## STM-001: Legacy hierarchy and action priorities

**P0 · Mapped**

Action: In v1 load/edit supported STM levels and set/clear H/M/L coverage on actions.

Expected: Hierarchy, mini coverage strips, severity and persisted per-action coverage agree without cross-version leakage.

Playwright: [src/tests/playwright/behavior/legacyStm.spec.ts:17](../../../src/tests/playwright/behavior/legacyStm.spec.ts#L17) — admin hierarchy edits persist into the v1 viewer without exposing v2 rules (chromium).

Playwright: [src/tests/playwright/behavior/actionVersionFieldsCoverage.spec.ts:21](../../../src/tests/playwright/behavior/actionVersionFieldsCoverage.spec.ts#L21) — legacy action type, title, task priority and all STM priority choices persist without v2 fields (chromium).

Evidence boundary: Preconfigures a schema-valid v1 hierarchy, edits Level 1 and Level 3 through the STM admin UI, and verifies the renamed hierarchy in the legacy viewer with no v2 rules pane. Supporting legacy action coverage test sets H/M/L, clears and reapplies a level, checks the mini coverage strip, and verifies persistence after reload.

## STM-002: Legacy STM filtering and execution colors

**P1 · Mapped**

Action: Filter/select STM cells with enabled/disabled and executed/skipped action fixtures.

Expected: Coverage counts, highlights and status colors use the correct plan/REX and omit excluded actions.

Playwright: [src/tests/playwright/behavior/legacyStm.spec.ts:99](../../../src/tests/playwright/behavior/legacyStm.spec.ts#L99) — legacy STM filters plan cells and keeps execution copies out of plan coverage (chromium).

Evidence boundary: Known plan/REX fixtures assert enabled-only counts and H/M plan cells through action-type filtering and crosshair highlighting. Selected REX summaries show complete in the completed color while skipped remains uncolored. Plan totals exclude REX copies; persisted mission data stays unchanged.

## STM-003: Satisfaction rule CRUD and validation

**P0 · Mapped**

Action: In v2 create independent rules, edit definition references and count, test the minimum count and empty exact selection, cancel deletion and reload.

Expected: Saved rule identities remain independent, count cannot fall below one, empty exact categories match nothing and referencing definitions remain protected. Current controls save edits immediately and expose no duplicate-rule operation.

Playwright: [src/tests/playwright/behavior/stmRules.spec.ts:30](../../../src/tests/playwright/behavior/stmRules.spec.ts#L30) — satisfaction rules create and edit independently, protect referenced definitions, honor delete cancellation, and persist after reload (chromium).

Playwright: [src/tests/playwright/behavior/stmRules.spec.ts:167](../../../src/tests/playwright/behavior/stmRules.spec.ts#L167) — STM matching uses exact tuples and wildcards, excludes missing categories, and crosses the rule threshold at the boundary (chromium).

Evidence boundary: Supported create/edit/delete, independent identities, count-minimum guard, empty exact selection producing zero matches, protected-definition deletion, canceled rule deletion and reload are covered. Rule edits commit immediately; there is no duplicate-rule control or separate draft Save/Cancel, and neither is claimed.

## STM-004: Rule tuple matching and thresholds

**P0 · Mapped**

Action: Use exact verb/noun/adjective tuples, wildcard/missing categories and threshold boundaries.

Expected: Known satisfied/unsatisfied counts agree with the rule semantics; duplicate and disabled actions are handled explicitly.

Playwright: [src/tests/playwright/behavior/stmRules.spec.ts:167](../../../src/tests/playwright/behavior/stmRules.spec.ts#L167) — STM matching uses exact tuples and wildcards, excludes missing categories, and crosses the rule threshold at the boundary (chromium).

Evidence boundary: Independent exact/wildcard/missing-adjective fixtures include separate identical tuples and a disabled tuple. The rules-page tally includes disabled actions while EVA coverage excludes them; threshold 2/3 changes explicit all/partial satisfaction counts.

## STM-005: Rule ordering layout and persistence

**P2 · Mapped**

Action: Reorder/resize supported rule columns and navigate/reload.

Expected: Persisted and local layout settings follow their intended scope without changing rule meaning.

Playwright: [src/tests/playwright/behavior/ruleLayout.spec.ts:32](../../../src/tests/playwright/behavior/ruleLayout.spec.ts#L32) — v2 rule columns keep fixed order and auto-fit while tier layout stays local (chromium).

Evidence boundary: With two known createdAt-ordered rules, verifies stable verb/noun/adjective order and shared measured widths. Attempts resize and drag-reorder where no controls are provided and confirms widths/order/meaning stay unchanged. Tier expansion survives switching Rules/Rule Matches locally but resets to defaults on reload; mission rule and definition data remain unchanged.

## STM-006: Rule collaboration and dangling references

**P0 · Mapped**

Action: Edit/delete rules and referenced definitions from two clients.

Expected: Clients converge with valid references and matching coverage without stale rule editor selections.

Playwright: [src/tests/playwright/behavior/ruleCollaboration.spec.ts:48](../../../src/tests/playwright/behavior/ruleCollaboration.spec.ts#L48) — rule edits, deletion, and referenced definition cleanup converge across two editors (chromium).

Evidence boundary: Two editor clients observe a valid Observe rule, change it to Collect, and verify the selected action match disappears. One client then deletes the rule while the other has its Matches view selected; that client shows the explicit no-rules state. The peer removes the now-unreferenced Collect definition, and persisted mission references remain valid.
