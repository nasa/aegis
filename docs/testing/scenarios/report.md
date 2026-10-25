# Comparison, STM coverage, campaigns and POI traceability

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: v2 planning mission with fixed action durations/counts and lineage; add multiple executed REXes and campaign membership.

Source: [src/components/panes/reports/reports-page.tsx](../../../src/components/panes/reports/reports-page.tsx), [src/components/panes/reports/shared/report-campaigns-dialog.tsx](../../../src/components/panes/reports/shared/report-campaigns-dialog.tsx), [src/components/panes/reports/eva-stm-coverage/eva-stm-coverage-page.tsx](../../../src/components/panes/reports/eva-stm-coverage/eva-stm-coverage-page.tsx), [src/components/panes/reports/poi-traceability/poi-traceability-page.tsx](../../../src/components/panes/reports/poi-traceability/poi-traceability-page.tsx).

Scenario mapping: **7/13 (53.8%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

Supporting unit/component evidence (no Playwright scenario credit): [src/tests/vitest-browser/Reports.browser.test.tsx](../../../src/tests/vitest-browser/Reports.browser.test.tsx), [src/tests/vitest-browser/PoiTraceability.browser.test.tsx](../../../src/tests/vitest-browser/PoiTraceability.browser.test.tsx), [src/tests/vitest/utils/evaReportColumns.campaign.test.ts](../../../src/tests/vitest/utils/evaReportColumns.campaign.test.ts).

## REPORT-001: comparison shows known plan metrics, signed differences, and station breakdowns without changing mission data

**P0 · Mapped**

Action: comparison shows known plan metrics, signed differences, and station breakdowns without changing mission data

Expected: Absolute station/action/time totals are 4/3, 1/0, 6/0 and 240/180; Diff shows signed -1/-60 and expansion yields the exact station/traverse distribution without mutating the mission.

Playwright: [src/tests/playwright/behavior/reports.spec.ts:32](../../../src/tests/playwright/behavior/reports.spec.ts#L32) — comparison shows known plan metrics, signed differences, and station breakdowns without changing mission data (chromium).

## REPORT-002: a saved action duration reaches an open report in another client and survives reload

**P0 · Mapped**

Action: a saved action duration reaches an open report in another client and survives reload

Expected: Saving action duration 23 updates an already-open peer report from 6 to 23 and preserves action count 1/0 after reload without browser errors.

Playwright: [src/tests/playwright/behavior/reports.spec.ts:74](../../../src/tests/playwright/behavior/reports.spec.ts#L74) — a saved action duration reaches an open report in another client and survives reload (chromium).

## REPORT-003: Comparison metric and baseline matrix

**P0 · Mapped**

Action: Compare known durations, rates, distances, ascent/descent, crew times, mass and equipment across several plans/REXes; change baseline.

Expected: Every absolute/difference cell uses the independent known quantity and signed/null semantics for its metric.

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:241](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L241) — all comparison metrics use independent quantities and signed/null differences against Alpha plan (chromium).

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:241](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L241) — all comparison metrics use independent quantities and signed/null differences against Alpha execution (chromium).

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:241](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L241) — all comparison metrics use independent quantities and signed/null differences against Bravo plan (chromium).

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:241](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L241) — all comparison metrics use independent quantities and signed/null differences against Bravo execution (chromium).

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:214](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L214) — equal travel totals have neutral cells and disappear from differences-only rows (chromium).

Evidence boundary: All 22 independently calculated rows across four baselines include mathematically equal travel times from different summation paths. Equality is neutral in text, tint, tooltip and differences-only filtering; meaningful small numeric differences remain distinct in unit regression.

## REPORT-004: Report column selection order and persistence

**P1 · Mapped**

Action: Show/hide and expand plan and REX columns; inspect automatic family ordering; change supported filters, navigate, open a peer and reload.

Expected: Visible column identities and expansions follow stable family ordering without duplicates; local preferences survive section navigation, stay client-local and reset on reload.

Playwright: [src/tests/playwright/behavior/reportColumns.spec.ts:24](../../../src/tests/playwright/behavior/reportColumns.spec.ts#L24) — EVA Comparison column visibility, stable family order, expansion and filters follow their local lifetime (chromium).

Playwright: [src/tests/playwright/behavior/reportColumns.spec.ts:24](../../../src/tests/playwright/behavior/reportColumns.spec.ts#L24) — EVA STM Coverage column visibility, stable family order, expansion and filters follow their local lifetime (chromium).

Evidence boundary: Both comparison and STM coverage check family/child visibility, exact Show matches results, hide/show all, automatic family order, plan/REX expansion, navigation, peer isolation and reload reset. A known completed/pending REX fixture changes coverage from two contributing actions to one under completeOnly. Preferences are client-local Redux state; manual column reordering is unsupported and unclaimed.

## REPORT-005: Campaign lifecycle and membership

**P0 · Mapped**

Action: Create, rename and delete campaigns through supported controls; add/remove/reinsert planned EVA members, cancel deletion, observe a peer and reload.

Expected: Unique planned membership and insertion order persist without mutating plans/REXes; new campaigns are independent and canceled deletion preserves the graph. Unsupported duplicate/manual-drag controls remain explicitly unclaimed.

Playwright: [src/tests/playwright/behavior/campaignLifecycle.spec.ts:12](../../../src/tests/playwright/behavior/campaignLifecycle.spec.ts#L12) — campaign lifecycle through EVA Comparison preserves unique ordered plan membership, confirmation and reload (chromium).

Playwright: [src/tests/playwright/behavior/campaignLifecycle.spec.ts:12](../../../src/tests/playwright/behavior/campaignLifecycle.spec.ts#L12) — campaign lifecycle through EVA STM Coverage preserves unique ordered plan membership, confirmation and reload (chromium).

Evidence boundary: Supported campaign create/rename/delete and ordered membership are tested through both report entries, including checkbox uniqueness, planned-only choices, removal/reinsertion ordering, independent new campaign identity, canceled deletion, peer member order and reload. The current dialog has no duplicate or manual member-drag control; neither is claimed.

## REPORT-006: Campaign execution selection and fallback

**P0 · Mapped**

Action: Select an explicit REX or latest fallback per member; delete the designated REX or plan.

Expected: Resolution follows the documented explicit/latest/absent rules and reports never compare an unrelated execution.

Playwright: [src/tests/playwright/behavior/campaignFallback.spec.ts:40](../../../src/tests/playwright/behavior/campaignFallback.spec.ts#L40) — campaign explicit/latest resolution falls back safely after deleting its designated REX (chromium).

Playwright: [src/tests/playwright/behavior/campaignFallback.spec.ts:40](../../../src/tests/playwright/behavior/campaignFallback.spec.ts#L40) — campaign explicit/latest resolution falls back safely after deleting its planned EVA (chromium).

Evidence boundary: Explicit versus latest selection uses independently known 250g/900g executions and a distinct unrelated 10000g execution. UI deletion of the designated REX falls back to the newest survivor; deleting the last REX/plan yields absent values. Selected execution EVAs and REXes are confirmed absent, planned EVA absence/preservation matches the delete mode, and peer/reload preserve unrelated ownership.

## REPORT-007: Campaign versus EVA aggregate deduplication

**P0 · Gap**

Action: Put shared stations/actions and multiple execution copies into a campaign.

Expected: Counts/mass/science coverage use the intended lineage and aggregation rules without double-counting shared members.

## REPORT-008: EVA STM coverage report

**P0 · Gap**

Action: Use a tiny known hierarchy/rule set with planned, complete, skipped, disabled and unmatched actions.

Expected: Cells, tuple counts, satisfied flags and totals match the known fixture across plan/REX/campaign scopes.

## REPORT-009: STM drilldown filters and navigation

**P1 · Gap**

Action: Expand coverage cells and follow matched/unmatched action links under filters.

Expected: Drilldown includes exactly the contributing actions and opens the correct parent/plan/REX without changing mission data.

## REPORT-010: POI traceability lineage

**P0 · Gap**

Action: Link a POI without adoption, adopt one action into two stations, duplicate plan and execute one copy.

Expected: Trace rows distinguish association from adoption and follow concrete UUIDs and lineage to the correct planned/executed actions.

## REPORT-011: POI traceability statuses and sample fields

**P0 · Gap**

Action: Change action status, executed mass and sample identifiers with missing/zero values.

Expected: Trace badges, counts and drilldown reflect the correct execution entry without treating missing as zero.

## REPORT-012: Report empty missing and deleted data

**P1 · Mapped**

Action: Open reports with no EVAs/rules/campaign members, then remove a selected entity from a peer.

Expected: Empty and unresolved states are explicit; no crash, stale detail or accidental mutation occurs.

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:280](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L280) — empty reports and remote deletion recover to an explicit empty state without incidental mutations (chromium).

Playwright: [src/tests/playwright/behavior/reportMatrix.spec.ts:280](../../../src/tests/playwright/behavior/reportMatrix.spec.ts#L280) — empty reports and remote deletion recover to another POI without incidental mutations (chromium).

Evidence boundary: No-EVA/no-rule, no-column, empty-campaign-member and POI empty states are explicit. Deleting a selected POI from a peer removes stale detail and falls back to another POI or named empty state without incidental document mutations.

## REPORT-013: Report permission and collaboration matrix

**P0 · Gap**

Action: Open all reports as viewer/editor, update rules/campaigns/actions remotely and reload.

Expected: Read-only reports stay non-mutating and every supported live dependency refreshes for the current scope.
