# Campaigns (reporting-only EVA sets) + TASK EVA Comparison + POI Traceability reports

## Context

The `stm-rules-improvements` branch shipped the EVA Coverage grid (STM level-3 × EVA columns, plan+REX families, baseline/diff). Discussing follow-on reports surfaced two needs:

1. **Missions accumulate many variants** of the same POI/station/traverse/EVA plus REX copies, so any mission-wide rollup (consumables, totals, set-level STM coverage) is meaningless without first saying *which EVAs constitute the real plan*. The fix: a reporting-only **Campaign** — a named, saved set of as-planned EVAs. Reports can then use a campaign as an aggregate column: its **Planned set** (union of member EVAs) or its **Executed set** (one designated REX per member EVA, default latest). Set-vs-set comparison answers "what didn't we get" post-mission, and plan-set-vs-plan-set comparison supports months-long planning. (`Eva.status` — Candidate/Approved/etc. — was confirmed to be dormant scaffolding used nowhere; campaigns are the first real "curated set" concept.)
2. **The science team can't trace their POIs**: they author POIs (with actions) first, POIs get linked to stations and actions copied over, EVAs are built from stations, REXes execute them. Nothing today answers "which POIs have been hit, and which REX actions that started life as POI actions were completed."

User decisions: campaigns persist in the **mission Automerge doc**; executed set = **designated REX per EVA, default latest**; this plan covers **campaigns + coverage integration + the TASK EVA comparison report + POI traceability**.

Verified during exploration:
- The POI lineage chain is intact end-to-end: REX action —(`refUuid`)→ planned station action; `parentActionUuid` (preserved through REX duplication, [stage-actions.ts:57-63](src/client/automerge/stage/stage-actions.ts#L57-L63)) → POI action uuid → `poiUuid` → POI; `Rex.actionEntries[rexActionUuid].rexStatus` = completion. Gaps to handle: station actions with `parentActionUuid: null`, dangling parents (POI action deleted — `checkMissionIntegrity` already flags these), `station.poiUuids` (checkbox link) is independent of action copies, sparse `actionEntries` (missing = pending).
- Adding an optional mission-doc map needs **no Automerge migration** (`applyUpdateMissionByField` lazy-inits, [apply-mission.ts:54-57](src/client/automerge/apply/apply-mission.ts#L54-L57)) but **must be added to the mission JSON schema** (`utils/validateSchemaServer`) or the server's post-migration validator exits 1.
- No utility exists yet for "actual distance walked" from `rex.posEntries` or "max distance from lander" outside the timeline code — building blocks are `getTotalDistance` / `getDistanceBetweenTwoCoordinates` in [geoMath.ts](src/utils/mapping/geoMath.ts).

## Workstream A — Campaign data model + editor

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

## Workstream B — Shared column families + campaign columns in EVA Coverage

**Hoist the column machinery** out of [stmEvaCoverage.ts](src/utils/stmEvaCoverage.ts) into a new pure module `src/utils/evaReportColumns.ts`: `getEvaColumns`, `groupCoverageColumns`, `getEligibleActionsForColumn`, plus the column types (rename ambient `StmCoverageEvaColumn` → `EvaReportColumn`; it's report-agnostic). Both the coverage report and the new comparison report consume it.

**New column kinds**: `campaignPlanned` / `campaignExecuted`, keys `campaign:{uuid}:planned|executed`, rendered as one header group per campaign. Eligible actions = union (concat — entity copies are distinct objects) of the member columns' eligible actions; executed columns apply the existing `rexStatusFilter` per member rex.

**Coverage integration** (in `stm-rules-coverage-*`):
- Campaign columns appear in the Columns multiselect and can be baseline. `computeColumnCoverage`, `diffLevel3`, `diffRuleActions`, `getCoverageDifferences` all operate on coverage/action collections and work unchanged on set columns — the planned-set-baseline vs executed-set diff directly shows "what we didn't get" as −removed tuples.
- **Expansion**: a campaign column's +/− expands into **one sub-column per member EVA** (not stations — stations don't align across EVAs and the per-EVA breakdown is what locates a difference). Sub-cells show absolute counts and sum to the campaign total, same invariant as station sub-cells.
- **Drilldown**: group matching actions by member EVA, then station/traverse (station names can collide across EVAs).
- Redux: no new derived-data keys needed; campaign columns flow through the existing `stmCoverage*` state.

## Workstream C — Reports pane + TASK EVA Comparison report

**New top-level `reports` pane** registered in [_paneTypes.ts](src/components/interface/_paneTypes.ts) following the `stmRules` precedent: a full-page tab shell (`src/components/panes/reports/reports-page.tsx`) with tabs **EVA Comparison | POI Traceability**. New Redux slice `src/store/report.ts` (+ `ReportState` in `src/typings/store.d.ts`, registered in `src/store/index.ts`) holding UI keys namespaced `reportComparison*` / `reportPoiTrace*`, mirroring the `stmCoverage*` conventions (baseline key, diff mode, hidden columns, hovered row/col, drilldown selection) and the derived-data-in-Redux pattern.

**Pure module** `src/utils/evaComparison.ts` (no framework imports, like `stmEvaCoverage.ts`): takes `mission` + columns from `evaReportColumns.ts`, returns per-column metric values. Metric rows, grouped, all sourced from existing computations in [calculatedFields.ts](src/store/processing/calculatedFields.ts) unless noted:

- **Time**: calculated total EVA time; allotted `eva.duration`; margin; traverse time; dwell split EV1 / EV2 / unassigned (label rows "calculated" vs "allotted" explicitly; note `totalDwellTime` = max(EV1, EV2)).
- **Distance**: total traverse distance; total ascent / descent; **max distance from lander** (new helper: max of `getDistanceBetweenTwoCoordinates(pt, mission.landerLocation, planetRadius)` over station locations + traverse path points — same approach as [common-timeline.ts:144-154](src/components/interface/timeline/common-timeline.ts#L144-L154)); worst-case station walkback duration.
- **Work**: station count; action count; total action time; planned sample mass; single-use consumables count.
- **REX-only rows** (blank for plan columns): actual sample mass (`actionEntries[].mass`); actions complete / skipped counts; **actual distance walked** (new helper reducing `rex.posEntries[].location` through `getTotalDistance`).

**Campaign aggregation semantics** per metric: sum (distances, times, mass, counts), max (max-from-lander, worst walkback), stated in a per-row legend. **Diff mode**: numeric delta vs baseline per cell, reusing the coverage report's visual grammar (green/red, `=`). Grid layout is row-major (metrics × columns) — simpler than coverage; reuse the sticky-header / rotated-label / crosshair CSS patterns (duplicated per project convention, not imported from the legacy pane) and the width constants from [stm-rules-tier-titles.tsx](src/components/panes/stm-rules/stm-rules-tier-titles.tsx) where applicable.

## Workstream D — POI Traceability report (science team)

**Pure module** `src/utils/poiTraceability.ts`. For each POI (rows; filterable by `tags`/name, sorted by `priorityOverride`), compute against a scope (All EVAs, or a selected campaign's planned/executed sets):

- **Linkage**: stations whose `poiUuids` include the POI (as-planned only via `selectAsPlannedStations`), and which in-scope EVAs contain those stations (invert `selectEvaStations`).
- **Action promotion**: per POI action (`poi.actionOrderUuids`), the station actions with `parentActionUuid === poiAction.uuid` (the join already used at [actions-assocpois.tsx:147](src/components/panes/actions-assocpois.tsx#L147)) and which in-scope EVAs they land in.
- **Execution**: for each in-scope execution rex, rex actions matching `parentActionUuid` (preserved through duplication), status from `actionEntries` (missing entry = pending).
- **Per-POI rollup** (factual, no scoring): `linked to N stations / M actions promoted of T / planned in E EVAs / X complete, Y skipped in executions`. A POI with zero linkage and zero promoted actions is the "not yet hit" case the science team is hunting for; keep "linked but no actions copied" and "actions copied but not linked" visibly distinct — that mismatch is precisely their pain point.
- **Gap handling**: null-guard dangling `parentActionUuid`; actions authored directly on stations (null parent) are simply not attributed to any POI.

**UI**: second tab of the reports pane. Master table of POIs with the rollup columns + scope/filter controls; clicking a row opens a drilldown (side panel, like the coverage drilldown) showing the full lineage per POI action: POI action → station copies (with `parentCopyDate`) → per-execution status.

## Implementation order

1. **A** — campaign type + apply file + JSON schema + editor dialog (mergeable alone; campaigns just don't appear anywhere yet).
2. **B** — hoist `evaReportColumns.ts`, add campaign columns to EVA Coverage (touches this branch's code; do while it's fresh).
3. **C** — reports pane shell + `evaComparison.ts` + comparison grid.
4. **D** — `poiTraceability.ts` + traceability tab.

Each pure module gets a vitest suite modeled on `src/tests/vitest/utils/stmEvaCoverage.test.ts` (campaign resolution incl. deleted EVAs/latest-rex default; union coverage invariants — sub-columns sum to total; metric aggregation sum/max; POI lineage incl. dangling parents, direct-authored actions, sparse actionEntries).

## Verification

- `npm run test:vitest` for the new suites; `npm run test:all` before merge.
- Manual, on a mission with multiple EVA variants + at least 2 REXes of one EVA (one with skipped actions):
  - Create a campaign, verify a second browser session sees it live (Automerge sync); restart the API server to confirm schema validation passes on existing docs.
  - EVA Coverage: campaign Planned as baseline vs campaign Executed in diff mode shows exactly the actions skipped in REXes as −removed; per-EVA sub-columns sum to the campaign total.
  - Comparison report: single-EVA columns match the numbers shown in that EVA's info panel; campaign column equals the hand-summed members; max-from-lander sanity-checked against map distance circles.
  - POI traceability: a POI action never copied shows "not promoted"; copy it via the existing clone button and watch it move to "planned"; mark the REX action complete and watch it move to "complete"; a POI checked into `station.poiUuids` with no copied actions shows the linked-but-no-actions state.
