# Comparison, STM coverage, campaigns and POI traceability

Generated from [scenario-catalog.json](../scenario-catalog.json). Edit the catalog, then run `npm run docs:playwright-scenarios`.

Fixture: v2 planning mission with fixed action durations/counts and lineage; add multiple executed REXes and campaign membership.

Source: [src/components/panes/reports/reports-page.tsx](../../../src/components/panes/reports/reports-page.tsx), [src/components/panes/reports/shared/report-campaigns-dialog.tsx](../../../src/components/panes/reports/shared/report-campaigns-dialog.tsx), [src/components/panes/reports/eva-stm-coverage/eva-stm-coverage-page.tsx](../../../src/components/panes/reports/eva-stm-coverage/eva-stm-coverage-page.tsx), [src/components/panes/reports/poi-traceability/poi-traceability-page.tsx](../../../src/components/panes/reports/poi-traceability/poi-traceability-page.tsx).

Scenario mapping: **2/13 (15.4%)**. Mapped means reviewed test implementation, not a passing browser run. Partial receives no percentage credit.

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

**P0 · Gap**

Action: Compare known durations, rates, distances, ascent/descent, crew times, mass and equipment across several plans/REXes; change baseline.

Expected: Every absolute/difference cell uses the independent known quantity and signed/null semantics for its metric.

## REPORT-004: Report column selection order and persistence

**P1 · Gap**

Action: Add/remove/reorder/expand plan and REX columns, change filters, navigate and reload.

Expected: Requested columns and local preferences remain consistent; no stale or duplicate column identities appear.

## REPORT-005: Campaign lifecycle and membership

**P0 · Gap**

Action: Create/rename/duplicate/delete campaigns; add/remove/reorder planned EVA members; cancel and reload.

Expected: Membership and ownership persist without mutating the plans; invalid/duplicate members are handled explicitly.

## REPORT-006: Campaign execution selection and fallback

**P0 · Gap**

Action: Select an explicit REX or latest fallback per member; delete the designated REX or plan.

Expected: Resolution follows the documented explicit/latest/absent rules and reports never compare an unrelated execution.

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

**P1 · Gap**

Action: Open reports with no EVAs/rules/campaign members, then remove a selected entity from a peer.

Expected: Empty and unresolved states are explicit; no crash, stale detail or accidental mutation occurs.

## REPORT-013: Report permission and collaboration matrix

**P0 · Gap**

Action: Open all reports as viewer/editor, update rules/campaigns/actions remotely and reload.

Expected: Read-only reports stay non-mutating and every supported live dependency refreshes for the current scope.
