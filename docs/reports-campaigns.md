# Campaigns (reporting-only EVA sets) + TASK EVA Comparison + POI Traceability reports

## Context

The `stm-rules-improvements` branch shipped the EVA Coverage grid (STM level-3 × EVA columns, plan+REX families, baseline/diff). Discussing follow-on reports surfaced two needs:

1. **Missions accumulate many variants** of the same POI/station/traverse/EVA plus REX copies, so any mission-wide rollup (consumables, totals, set-level STM coverage) is meaningless without first saying *which EVAs constitute the real plan*. The fix: a reporting-only **Campaign** — a named, saved set of as-planned EVAs. Reports can then use a campaign as an aggregate column: its **Planned set** (union of member EVAs) or its **Executed set** (one designated REX per member EVA, default latest). Set-vs-set comparison answers "what didn't we get" post-mission, and plan-set-vs-plan-set comparison supports months-long planning. (`Eva.status` — Candidate/Approved/etc. — was confirmed to be dormant scaffolding used nowhere; campaigns are the first real "curated set" concept.)
2. **The science team can't trace their POIs**: they author POIs (with actions) first, POIs get linked to stations and actions copied over, EVAs are built from stations, REXes execute them. Nothing today answers "which POIs have been hit, and which REX actions that started life as POI actions were completed."

User decisions: campaigns persist in the **mission Automerge doc**; executed set = **designated REX per EVA, default latest**; this plan covers **campaigns + coverage integration + the TASK EVA comparison report + POI traceability**, all consolidated under a new top-level **Reports** pane (EVA Coverage moves there — retitled **EVA STM Coverage** — and shares its table components with the comparison report).

Verified during exploration:
- The POI lineage chain is intact end-to-end: REX action —(`refUuid`)→ planned station action; `parentActionUuid` (preserved through REX duplication, [stage-actions.ts:57-63](src/client/automerge/stage/stage-actions.ts#L57-L63)) → POI action uuid → `poiUuid` → POI; `Rex.actionEntries[rexActionUuid].rexStatus` = completion. Gaps to handle: station actions with `parentActionUuid: null`, dangling parents (POI action deleted — `checkMissionIntegrity` already flags these), `station.poiUuids` (checkbox link) is independent of action copies, sparse `actionEntries` (missing = pending).
- Adding an optional mission-doc map needs **no Automerge migration** (`applyUpdateMissionByField` lazy-inits, [apply-mission.ts:54-57](src/client/automerge/apply/apply-mission.ts#L54-L57)) but **must be added to the mission JSON schema** (`utils/validateSchemaServer`) or the server's post-migration validator exits 1.
- No utility exists yet for "actual distance walked" from `rex.posEntries` or "max distance from lander" outside the timeline code — building blocks are `getTotalDistance` / `getDistanceBetweenTwoCoordinates` in [geoMath.ts](src/utils/mapping/geoMath.ts).

## Workstream A — Campaign data model + editor ✅ DONE

**Type** (ambient, in `src/typings/mission.d.ts` alongside the other mission maps):

```ts
interface ReportCampaign {
  uuid: string;
  name: string;
  description: string | null;
  memberEvaUuids: string[];              // as-planned EVA uuids, ordered
  executionRexUuidByEvaUuid: { [evaUuid: string]: string } | null; // absent/missing key = "latest rex"
  createdAt: number;
  updatedAt: number | null;
}
// Mission gains: reportCampaigns?: { [uuid: string]: ReportCampaign } | null
```

**Apply layer**: new `src/client/automerge/apply/apply-mission-reportCampaign.ts` mirroring [apply-mission-circleDefinition.ts](src/client/automerge/apply/apply-mission-circleDefinition.ts) verbatim: `applyCreateReportCampaign`, `applyUpdateReportCampaignByField`, `applyDeleteReportCampaign`, all via `applyUpdateMissionByField` + `updatedAt` bump. Components mutate through `withMissionChange`. No stage/thunk needed (single-entity ops).

**Schema**: add `reportCampaigns` as an optional property to the mission JSON schema used by `validateSchemaServer` — required, or the migration validator kills the server.

**Resolution helpers** (pure, in the shared columns module below): `resolveCampaignExecutionRexes(mission, campaign)` — for each member EVA, the designated rex from `executionRexUuidByEvaUuid`, else the latest rex (by `createdAt`) whose EVA `refUuid`-matches; EVAs with no rex are simply absent from the executed set (surface a "n of m executed" count in the UI). Skip member evaUuids that no longer exist (deleted EVAs).

**Editor UI**: a "Campaigns…" management dialog opened from the report controls (coverage controls + the new comparison report controls). List / create / rename / delete campaigns; checkbox list of as-planned EVAs (reuse the as-planned detection from `getEvaColumns`); per-member REX dropdown defaulting to "Latest". Follow the `<dialog>` pattern of [stm-rules-coverage-help.tsx](src/components/panes/stm-rules/stm-rules-coverage/stm-rules-coverage-help.tsx).

## Workstream B — Shared column families + campaign columns in EVA Coverage ✅ DONE

> Landed: `src/utils/evaReportColumns.ts` (`getEvaColumns`, `groupCoverageColumns`, `getCampaignMemberItems`, `groupCampaignMatchesByMember`, `actionBelongsToCampaignMember`, ambient `EvaReportColumn`), campaign `campaignPlanned` / `campaignExecuted` columns, and the coverage integration below — all currently under the STM Rules pane's `stm-rules-coverage/`. **Workstream C moves this code into the Reports pane and factors the reusable parts into `reports/shared/`; C and D build on these helpers.**

**Hoist the column machinery** out of [stmEvaCoverage.ts](src/utils/stmEvaCoverage.ts) into a new pure module `src/utils/evaReportColumns.ts`: `getEvaColumns`, `groupCoverageColumns`, `getEligibleActionsForColumn`, plus the column types (rename ambient `StmCoverageEvaColumn` → `EvaReportColumn`; it's report-agnostic). Both the coverage report and the new comparison report consume it.

**New column kinds**: `campaignPlanned` / `campaignExecuted`, keys `campaign:{uuid}:planned|executed`, rendered as one header group per campaign. Eligible actions = union (concat — entity copies are distinct objects) of the member columns' eligible actions; executed columns apply the existing `rexStatusFilter` per member rex.

**Coverage integration** (in `stm-rules-coverage-*`):
- Campaign columns appear in the Columns multiselect and can be baseline. `computeColumnCoverage`, `diffLevel3`, `diffRuleActions`, `getCoverageDifferences` all operate on coverage/action collections and work unchanged on set columns — the planned-set-baseline vs executed-set diff directly shows "what we didn't get" as −removed tuples.
- **Expansion**: a campaign column's +/− expands into **one sub-column per member EVA** (not stations — stations don't align across EVAs and the per-EVA breakdown is what locates a difference). Sub-cells show absolute counts and sum to the campaign total, same invariant as station sub-cells.
- **Drilldown**: group matching actions by member EVA, then station/traverse (station names can collide across EVAs).
- Redux: no new derived-data keys needed; campaign columns flow through the existing `stmCoverage*` state.

## Workstream C — Reports pane (absorbs EVA Coverage) + TASK EVA Comparison report ✅ DONE

> Landed: new top-level **Reports** pane ([reports-page.tsx](src/components/panes/reports/reports-page.tsx), tabs EVA STM Coverage | EVA Comparison | POI Traceability); coverage moved to [reports/eva-stm-coverage/](src/components/panes/reports/eva-stm-coverage/) and retitled; the shared grid extracted to [reports/shared/](src/components/panes/reports/shared/) (`report-column-header`, `report-controls`, `report-column-panel`, `report-cell`, `report-side-panel`, `report-campaigns-dialog`, `report-grid.module.css`); a `reportId` React context ([reports-context.tsx](src/components/panes/reports/reports-context.tsx)) threads the report identity to shared components; Redux generalised into [report.ts](src/store/report.ts) (`ReportState` keyed by `"stmCoverage" | "comparison" | "poiTrace"`, reducers take a `reportId`), replacing the `stmCoverage*` keys in `stm.ts`; the STM Rules pane's coverage tab removed. Comparison pure module [evaComparison.ts](src/utils/evaComparison.ts) + [eva-comparison/](src/components/panes/reports/eva-comparison/) tab. **Deviations from the plan below:** (a) sample-mass rows report kilograms (`kg`), converted from the app's native grams, so the cell numbers stay compact; (b) the shared REX-status filter is hidden on the Comparison tab (`showRexFilter={false}`) — it has no coverage semantics there; (c) in Comparison only campaign columns expand (into member EVAs); a single EVA/REX column has no per-station sub-metrics, so expanding it just shows its Total.

**Consolidate under one pane and share the table.** EVA Coverage is just another EVA-column report, so **move it out of the STM Rules pane into a new top-level `reports` pane** and have the comparison report reuse the *same* grid components rather than duplicating their CSS. The two reports differ only in their **left axis** (STM hierarchy vs. metric rows) and **cell body** (coverage rollup vs. metric value); everything to the right of the row labels — the column-header band, EVA-family / campaign grouping + dividers, per-column expansion into sub-columns/member EVAs, baseline + diff visual grammar, crosshair hover, sticky layout, and the controls row — is identical and becomes shared. Table layout is therefore literally the same components, not a look-alike.

**New pane.** Register a `reports` pane in [_paneTypes.ts](src/components/interface/_paneTypes.ts) following the `stmRules` precedent (`fullScreen: true`, `leftPane: () => null`, page in `rightPane`). Give it its own section identity: **`color: "var(--reports)"`** (new global `--reports: #b98cff` — a violet, added to [globals.css](src/styles/globals.css); no existing pane occupies that hue) and **`icon: faChartColumn`** (from `@fortawesome/free-solid-svg-icons`, imported in `_paneTypes.ts` alongside the other pane icons). The pane title is "Reports". Tab shell `src/components/panes/reports/reports-page.tsx` with tabs **EVA STM Coverage | EVA Comparison | POI Traceability** (mirror the tab-bar pattern in [stm-rules-page.tsx](src/components/panes/stm-rules/stm-rules-page.tsx)). Note the coverage report is retitled **"EVA STM Coverage"** here (it rolls up STM rule satisfaction — the new name disambiguates it from the EVA Comparison report). Remove the "EVA Coverage" tab from `stm-rules-page.tsx` — drop `coverage` from its `TABS` and the `"coverage"` member from the `StmRulesTab` union in `src/typings/store.d.ts`.

**Move the coverage components** out of `src/components/panes/stm-rules/stm-rules-coverage/` and split them into a shared grid layer + a coverage-specific layer:

- **Shared (`src/components/panes/reports/shared/`)** — report-agnostic, consumed by both tabs:
  - `report-column-header.tsx` (from [stm-rules-coverage-header.tsx](src/components/panes/stm-rules/stm-rules-coverage/stm-rules-coverage-header.tsx)): the column band — `groupCoverageColumns`, EVA/REX vs CAMPAIGNS section dividers, rotated/truncated labels, expand-collapse, baseline-on-click.
  - `report-controls.tsx` (from [stm-rules-coverage-controls.tsx](src/components/panes/stm-rules/stm-rules-coverage/stm-rules-coverage-controls.tsx)): baseline dropdown, Diff toggle, Differences-only, Include-REX-actions filter, the View column panel, Campaigns dialog, Help.
  - `report-column-panel.tsx` (from [stm-rules-coverage-column-panel.tsx](src/components/panes/stm-rules/stm-rules-coverage/stm-rules-coverage-column-panel.tsx)) and `report-campaigns-dialog.tsx` (moved from `stm-rules-coverage/report-campaigns-dialog.tsx` largely as-is).
  - `report-cell.tsx`: extract the `BaseCell` shell (crosshair-hover + cell-selection wiring) and the diff-value renderer (`+Δ / −Δ`, `=`, green/red net tint) from [stm-rules-coverage-cell.tsx](src/components/panes/stm-rules/stm-rules-coverage/stm-rules-coverage-cell.tsx) so both reports render diff cells identically.
  - `report-grid.module.css`: generalised from [stm-rules-coverage.module.css](src/components/panes/stm-rules/stm-rules-coverage/stm-rules-coverage.module.css) (keep the sticky-header / rotated-label / divider / drilldown / column-panel classes; this is the single source of the shared look, **not** duplicated). Width constants stay in [stm-rules-tier-titles.tsx](src/components/panes/stm-rules/stm-rules-tier-titles.tsx) (`STM_COVERAGE_STATION_CELL_WIDTH`, `STM_COVERAGE_SUMMARY_CELL_WIDTH`) — import them from there.
- **Coverage-specific (`src/components/panes/reports/eva-stm-coverage/`)** — `eva-stm-coverage-page.tsx` (from `stm-rules-coverage-page.tsx`), `eva-stm-coverage-cell.tsx` (coverage rollup + `diffLevel3Actions`, on top of the shared `report-cell.tsx`), `eva-stm-coverage-table.tsx` (left axis = `STMRulesTable` `coverageContent` render prop — the render prop keeps living in `stm-rules/` since it's the STM hierarchy), and `eva-stm-coverage-drilldown.tsx` (per-rule action breakdown; coverage-only, stays coverage-specific).

**Redux: one shared, per-report slice.** Replace the `stmCoverage*` keys in [stm.ts](src/store/stm.ts) with a new `src/store/report.ts` slice (+ `ReportState` in `src/typings/store.d.ts`, registered in [store/index.ts](src/store/index.ts)) holding the column-report UI state **keyed by report id** (`"stmCoverage" | "comparison" | "poiTrace"`) so each tab keeps its own baseline / diff mode / hidden + expanded columns / hovered row + col / cell selection / rex-status filter / differences-only / derived data (the `poiTrace` slot holds Workstream D's scope/filter/sort/selection instead — see D). Reducers take a `reportId` (`reportSetBaselineColumnKey({ reportId, columnKey })`, …). Shared components read `state.report[reportId].*`; the coverage left-axis consumers that read `state.stm.stmCoverage*` today — including `stmCoverageVisibleStmUuids` / `stmCoverageHoveredLeftItem` in [stm-rules-list-table.tsx](src/components/panes/stm-rules/stm-rules-list-table.tsx) — switch to `state.report.stmCoverage.*`. Preserves the derived-data-in-Redux pattern and drops the `reportComparison*`-vs-`stmCoverage*` duplication the earlier draft implied.

**Comparison pure module** `src/utils/evaComparison.ts` (no framework imports, like `stmEvaCoverage.ts`): takes `mission` + columns from `evaReportColumns.ts`, returns per-column metric values keyed by a stable metric-row id. Metric rows, grouped, all sourced from existing computations in [calculatedFields.ts](src/store/processing/calculatedFields.ts) unless noted:

- **Time**: calculated total EVA time; allotted `eva.duration`; margin; traverse time; dwell split EV1 / EV2 / unassigned (label rows "calculated" vs "allotted" explicitly; note `totalDwellTime` = max(EV1, EV2)).
- **Distance**: total traverse distance; total ascent / descent; **max distance from lander** (new helper: max of `getDistanceBetweenTwoCoordinates(pt, mission.landerLocation, planetRadius)` over station locations + traverse path points — same approach as [common-timeline.ts:144-154](src/components/interface/timeline/common-timeline.ts#L144-L154)); worst-case station walkback duration.
- **Work**: station count; action count; total action time; planned sample mass; single-use consumables count.
- **REX-only rows** (blank for plan columns): actual sample mass (`actionEntries[].mass`); actions complete / skipped counts; **actual distance walked** (new helper reducing `rex.posEntries[].location` through `getTotalDistance`).

**Comparison tab (`src/components/panes/reports/eva-comparison/`)**: `eva-comparison-page.tsx` computes the metric matrix into `state.report.comparison` (same derived-data effect shape as the coverage page), then renders the **shared `report-controls.tsx` + `report-column-header.tsx`** above a metric-rows left axis (`eva-comparison-table.tsx` — grouped metric labels: Time / Distance / Work / REX-only, with group sub-headers on the left axis). Because the header, columns, expansion, and diff grammar are the shared components, **the table layout is identical to EVA Coverage** — only the left axis and the cell body differ. `eva-comparison-cell.tsx` renders the metric value (absolute mode) or a numeric Δ vs baseline (diff mode) through the shared `report-cell.tsx` diff renderer. **Campaign aggregation** per metric: sum (distances, times, mass, counts), max (max-from-lander, worst walkback), stated in a per-row legend.

## Workstream D — POI Traceability report (science team) ✅ DONE

> Landed: pure module [poiTraceability.ts](src/utils/poiTraceability.ts) (`computePoiTraceability`, `resolveScopeEvaUuids`, `resolveScopeExecutionRexes`; types in [poiTraceability.d.ts](src/typings/poiTraceability.d.ts)) reusing `evaReportColumns.ts` for scope/campaign resolution, and the [poi-traceability/](src/components/panes/reports/poi-traceability/) tab (master table + scope/filter/sort controls + lineage drilldown via the shared `report-side-panel`). UI state lives in the `report.ts` slice's `poiTrace` slot. `PoiTraceScope` is declared once in [store.d.ts](src/typings/store.d.ts) (shared by the slice and the pure module).

POI Traceability is the **third tab** of the Reports pane (**EVA STM Coverage | EVA Comparison | POI Traceability**). It's not an EVA-column report — its table is POIs (rows) × rollup columns — so it does **not** use the shared column-header band, but it **does** carry Workstream B's building blocks and the shared reports infrastructure: scope resolution reuses `evaReportColumns.ts` (`getEvaColumns` for as-planned EVA detection; the campaign planned/executed resolution helpers) so "selected campaign's planned/executed sets" means exactly the same set as the campaign columns in the other two reports, and its drilldown reuses the shared side-panel component + resizer + CSS from `reports/shared/`.

**Pure module** `src/utils/poiTraceability.ts`. For each POI (rows; filterable by `tags`/name, sorted by `priorityOverride`), compute against a scope (All EVAs, or a selected campaign's planned/executed sets — resolved via `evaReportColumns.ts`):

- **Linkage**: stations whose `poiUuids` include the POI (as-planned only via `selectAsPlannedStations`), and which in-scope EVAs contain those stations (invert `selectEvaStations`).
- **Action promotion**: per POI action (`poi.actionOrderUuids`), the station actions with `parentActionUuid === poiAction.uuid` (the join already used at [actions-assocpois.tsx:147](src/components/panes/actions-assocpois.tsx#L147)) and which in-scope EVAs they land in.
- **Execution**: for each in-scope execution rex, rex actions matching `parentActionUuid` (preserved through duplication), status from `actionEntries` (missing entry = pending).
- **Per-POI rollup** (factual, no scoring): `linked to N stations / M actions promoted of T / planned in E EVAs / X complete, Y skipped in executions`. A POI with zero linkage and zero promoted actions is the "not yet hit" case the science team is hunting for; keep "linked but no actions copied" and "actions copied but not linked" visibly distinct — that mismatch is precisely their pain point.
- **Gap handling**: null-guard dangling `parentActionUuid`; actions authored directly on stations (null parent) are simply not attributed to any POI.

**UI** (`src/components/panes/reports/poi-traceability/`): master table of POIs with the rollup columns + scope/filter controls. UI state lives in the `report.ts` slice's `poiTrace` slot (scope selection, tag/name filter, sort, selected POI, drilldown width) alongside the other two reports. Clicking a row opens a drilldown reusing the shared `reports/shared/` side panel (same resizer + CSS as the coverage drilldown) showing the full lineage per POI action: POI action → station copies (with `parentCopyDate`) → per-execution status.

## Implementation order

1. ~~**A** — campaign type + apply file + JSON schema + editor dialog.~~ ✅ Done.
2. ~~**B** — hoist `evaReportColumns.ts`, add campaign columns to EVA Coverage.~~ ✅ Done (still under the STM Rules pane; C relocates it).
3. ~~**C** — reports pane shell; **move EVA Coverage into it** (retitled EVA STM Coverage) and extract the shared `reports/shared/` grid from the B-era coverage code (coverage keeps working, now under Reports); generalise the coverage Redux state into `report.ts` keyed by report id; then add `evaComparison.ts` + the comparison tab reusing the shared grid.~~ ✅ Done.
4. ~~**D** — `poiTraceability.ts` + traceability tab, reusing B's `evaReportColumns.ts` for scope/campaign resolution and C's shared drilldown panel.~~ ✅ Done.

> **Status:** all four workstreams implemented. `npm run test:all` (lint + tsc + build + vitest) passes; `evaComparison.test.ts` (18) and `poiTraceability.test.ts` (20) added. The manual UI checks in Verification below remain to be run against a live mission.

Each pure module gets a vitest suite modeled on `src/tests/vitest/utils/stmEvaCoverage.test.ts` (campaign resolution incl. deleted EVAs/latest-rex default; union coverage invariants — sub-columns sum to total; metric aggregation sum/max; POI lineage incl. dangling parents, direct-authored actions, sparse actionEntries).

## Verification

- `npm run test:vitest` for the new suites; `npm run test:all` before merge.
- Manual, on a mission with multiple EVA variants + at least 2 REXes of one EVA (one with skipped actions):
  - Create a campaign, verify a second browser session sees it live (Automerge sync); restart the API server to confirm schema validation passes on existing docs.
  - EVA STM Coverage (now under the Reports pane): campaign Planned as baseline vs campaign Executed in diff mode shows exactly the actions skipped in REXes as −removed; per-EVA sub-columns sum to the campaign total. Confirm it behaves identically to before the move (baseline, diff, expansion, drilldown, column panel, campaigns dialog) and that the STM Rules pane no longer shows the tab.
  - Comparison report: header band, column expansion, and diff cells look and behave identically to EVA STM Coverage (shared components); single-EVA columns match the numbers shown in that EVA's info panel; campaign column equals the hand-summed members; max-from-lander sanity-checked against map distance circles.
  - POI traceability: a POI action never copied shows "not promoted"; copy it via the existing clone button and watch it move to "planned"; mark the REX action complete and watch it move to "complete"; a POI checked into `station.poiUuids` with no copied actions shows the linked-but-no-actions state.
