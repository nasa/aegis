# Mission Priority Identifiers Report — Plan

## Context

In Action System v2, missions define a catalog of **Mission Priority Identifiers** (`mission.missionPriorities`: `{ [uuid: string]: { trace: string; category: string } }`), grouped by `category` (e.g., `"Sample Collection"`) and identified by a `trace` code (e.g., `"SIMD-0002.1"`). Individual actions (on POIs, stations, and traverses) and action templates can reference a priority via `action.missionPriorityUuid`.

Flight controllers and science planners need a report in the **Reports** pane showing **which Mission Priority Identifiers are planned to be done and which have been done** across individual EVAs, REX executions, and **Campaigns** (named groups of as-planned EVAs and their designated/latest REX executions, shared with the existing reports).

### Why a Column-Family Grid + Lineage Drilldown

The Reports pane (`src/components/panes/reports/reports-page.tsx`) currently hosts three tabs:
1. **EVA STM Coverage** — shared column-family grid (`evaReportColumns.ts` + `reports/shared/*`), with STM hierarchy on the left axis and EVA / REX / Campaign (`Planned set` | `Executed set`) columns on the right.
2. **EVA Comparison** — shared column-family grid, with metric rows on the left axis.
3. **POI Traceability** — master-detail tree tracing POI actions to station adoptions and REX outcomes (currently hardcoded to `{ type: "all" }` scope).

A new fourth tab — **Mission Priorities** (`key: "missionPriorities"`) — naturally fits the **shared column-family grid** (`ReportControls`, `ReportColumnHeader`, `ReportColumnPanel`, `ReportCampaignsDialog`, `BaseCell`, `ReportSidePanel`):
- **Left axis**: Mission Priority Identifiers grouped by `category` (collapsible category header rows, sorted alphabetically) and `trace` rows within each category (sorted with numeric collation, e.g., `SIMD-0002` before `SIMD-0010`, matching `sortMissionPriorities` in `mission-right-missionPriorities.tsx`).
- **Columns**: As-planned EVAs, REX executions, and Campaign `Planned set` / `Executed set` columns from `getEvaColumns(mission)`, plus column expansion (`+`/`−`) into stations/traverses (for EVA/REX columns) or member EVAs (for Campaign columns).
- **Baseline & Diff mode**: Comparing a Campaign's `Planned set` (baseline) against its `Executed set` immediately highlights which priorities were completed vs. lost/skipped/disabled.
- **Side-panel drilldown**: Clicking any cell (or priority row) opens `ReportSidePanel` with the full list of actions carrying that priority in the selected column (and baseline comparison when Diff mode is active), plus an **Unscheduled / Non-EVA Usages** summary (POI actions not yet adopted into the column, unassigned station/traverse actions, and action templates) so planners can see *why* a priority is missing from an EVA or campaign.

---

## Edge Cases & Special Conditions to Accommodate

1. **Disabled Actions (`action.enabled === false`)**
   - Actions on stations or traverses (both as-planned and inside a REX) can be disabled (`enabled: false`) while still carrying a `missionPriorityUuid`.
   - In `actions-action.tsx`, a disabled action in a REX hides its `RexStatusMenu` and does not contribute to EVA duration/dwell calculations (`calculatedFields.ts`), nor does it satisfy STM rules (`evaReportColumns.ts`).
   - **How we accommodate this**:
     - Rather than silently dropping disabled actions (which makes a priority look completely unassigned, hiding the fact that an action exists for it but was toggled off), the pure calculator tracks **both** enabled actions and disabled actions per cell.
     - A cell whose priority is *only* present on disabled action(s) in that column renders a distinct **`disabledOnly` state** (e.g., muted/hatched badge or `0 (D)` indicator with tooltip `"N disabled action(s) — not active in plan/execution"`) rather than blending into `none` (`0`).
     - Even when enabled actions exist, the cell tooltip and drilldown panel explicitly list any disabled actions under a **"Disabled in this EVA/REX"** group (with a `Disabled` pill badge) so reviewers see the complete picture.
     - A filter control in the toolbar/drilldown allows toggling whether disabled actions are surfaced in the grid rollup or hidden.

2. **REX Execution Statuses (`complete`, `in-progress`, `pending`, `skipped`)**
   - In REX columns and Campaign `Executed set` columns, an enabled action has a status in `rex.actionEntries?.[action.uuid]?.rexStatus` (defaulting to `"pending"` when `actionEntries` or the entry is null/missing).
   - **How we accommodate this**:
     - Reuse the shared `rexStatusFilter` (`"all"` | `"notSkipped"` | `"completeOnly"`), defaulting to `"completeOnly"` or `"notSkipped"` (configurable, or showing a status-aware cell rollup).
     - Better yet: in absolute mode on REX and `campaignExecuted` columns, cell color/status reflects **execution completion** alongside action count:
       - `complete` (green): at least one enabled action with this priority is marked `complete` (or all matching actions satisfy the active `rexStatusFilter`).
       - `inProgress` / `pending` (blue/amber): planned in the REX and not skipped/disabled, but still `in-progress` or `pending`.
       - `skippedOnly` (red/warning): all enabled actions for this priority in the REX were marked `skipped` (or `disabledOnly` if disabled).
       - `none` (dim `0`): no actions with this priority in the REX.
     - On as-planned EVA and `campaignPlanned` columns, cell status reflects **planning status**:
       - `planned` (green): ≥1 enabled action in the EVA/campaign carries this priority.
       - `disabledOnly` (amber/muted): ≥1 disabled action carries this priority, 0 enabled.
       - `none` (dim `0`): 0 actions in the EVA/campaign.

3. **POI Actions Not Yet Promoted (or Partially Promoted) to EVAs**
   - Science teams often assign `missionPriorityUuid` on **POI actions** first, then promote (copy) those actions onto stations.
   - If a POI action has a priority identifier, but has **never been copied to a station**, or was copied to a station that is **not in any EVA sequence** (or not in the selected Campaign's member EVAs), looking only at EVA columns would show `0` across the board with no explanation of where the priority lives.
   - **How we accommodate this**:
     - Compute mission-wide **non-EVA / unscheduled usages** per priority:
       - **POI actions** (`action.poiUuid != null`) carrying the priority (including whether they have been promoted via `parentActionUuid` to any station).
       - **Unassigned Station / Traverse actions**: actions on a station or traverse that is not part of any as-planned EVA sequence (or not in the current campaign).
       - **Action Templates** (`mission.actionTemplates`) carrying the priority.
     - Surface a dedicated summary column or badge on the left-axis priority row (e.g., a compact pill showing `POI` / `Unassigned` / `Template` counts when a priority has usages outside EVAs, or a `"Never planned"` warning indicator when a priority has 0 enabled EVA actions across all as-planned EVAs).
     - Clicking the priority row or cell opens the drilldown showing both the column's EVA/REX actions and a collapsible **"Other Usages in Mission (POIs, Unscheduled Stations, Templates)"** section with `ActionPreview` links.

4. **Priority Divergence Across the POI → Station → REX Lineage**
   - When a POI action is copied to a station (`stageDuplicateActions`), `missionPriorityUuid` is cloned onto the station action. Later, a user might:
     - Change or clear `missionPriorityUuid` on the station action copy (or on the original POI action) — note how `poi-traceability-drilldown.tsx` already checks `mission.actions[copy.stationActionUuid]?.missionPriorityUuid !== mission.actions[action.poiActionUuid]?.missionPriorityUuid`.
     - Change `missionPriorityUuid` on an action inside a REX during unrestricted/added-action editing, or delete an action from a REX.
   - **How we accommodate this**:
     - Each column evaluates `action.missionPriorityUuid` directly on the actions belonging to that column's stations/traverses (so REX edits or station overrides are faithfully reflected in that column).
     - Additionally, if a station/REX action has `parentActionUuid` pointing to a POI action whose `missionPriorityUuid` differs from the copy's, the drilldown flags the lineage mismatch (`"Inherited from POI action [Name] (priority changed from X to Y)"`).

5. **Legacy Adjective-Encoded Priorities (`ReportActionTitle` Fallback)**
   - As seen in `src/components/panes/reports/shared/report-action-title.tsx` (lines 26–41), older v2 missions sometimes encoded mission priorities in the `adjective` slot of `actionDefinition` (when `nounToAdjective` is `"Pri"`/`"Priority"`, `labels.adjective.singular` is `"Priority"`, or the adjective name starts with `"Pri:"` / `"Priority:"`).
   - **How we accommodate this**:
     - Extract a shared helper `resolveActionMissionPriority(action, mission)` used by both `ReportActionTitle` and the new report's pure module.
     - Primary match is `action.missionPriorityUuid === priorityUuid`. If `action.missionPriorityUuid` is null and the mission uses the legacy adjective pattern whose normalized trace matches a `mission.missionPriorities` entry's `trace` (case-insensitive), optionally attribute or note it so legacy missions aren't blank.

6. **Shared Stations / Traverses Across Multiple EVAs in a Campaign**
   - Multiple as-planned EVAs in the same Campaign can include the same station or traverse in their sequences (or a single EVA can visit a station twice, though `selectEvaStations` / `getEvaSequenceItems` dedupes within an EVA).
   - **How we accommodate this**:
     - Follow the exact convention established in `evaReportColumns.ts`:
       - Within a single EVA, a revisited station's actions are counted once (`new Set(selectEvaStations(...))`).
       - Across a Campaign's member EVAs, `getCampaignMemberItems` and per-member sub-columns partition occurrences across members (like `groupCampaignMatchesByMember`) so expanded member EVA sub-columns always sum to the Campaign `Total` cell.
       - In the drilldown, actions in a Campaign column are prefixed with their member EVA name (`Alpha / Station 1: ...`), and if an underlying station action is shared by two member EVAs, each member occurrence is clearly labeled.

7. **Campaign Member EVA With No Execution REX Yet**
   - A Campaign may have 4 planned member EVAs, of which only 2 have been executed in a REX so far (`resolveCampaignExecutionRexes` returns 2 REXes).
   - **How we accommodate this**:
     - Comparing `Campaign: Planned set` (baseline) vs. `Campaign: Executed set` in Diff mode naturally shows `−N` for priorities planned in the unexecuted EVAs.
     - In the drilldown for `Campaign: Executed set`, `In baseline only (−)` actions indicate whether the action was **skipped/disabled in a completed REX** vs. **belongs to a member EVA that has not been executed yet** (`"EVA Bravo: no execution REX recorded"`).

8. **Non-STM Actions (`action.stmAction === false`)**
   - Unlike STM Coverage (`getEligibleActionsForColumn` in `evaReportColumns.ts`, which filters `if (!action.stmAction || !action.enabled) return false`), `missionPriorityUuid` can be assigned to **any** v2 action — both STM actions (`stmAction === true`) and non-STM actions (`stmAction === false`, which use free-text `action.name`).
   - **How we accommodate this**:
     - Do **not** filter out `stmAction === false` in the Mission Priorities report! Both STM and non-STM actions carry `missionPriorityUuid` in `actions-action.tsx` (lines 310 and 355) and `actions-action-body.tsx` (line 236).

9. **Orphaned / Deleted Entities & Action System Version 1**
   - If `mission.actionSystemVersion === 1` or `mission.missionPriorities` is empty, display a clear empty-state message (mirroring `EvaStmCoveragePage` when `level3s.length === 0`).
   - Guard against dangling `stationUuid`, `traverseUuid`, `poiUuid`, or `evaUuid` references.

---

## Architecture & Implementation Plan

### 1. Pure Computation Module: `src/utils/missionPriorityReport.ts` (+ `src/typings/missionPriorityReport.d.ts`)

Create a pure, framework-free module (no React/Redux/Automerge imports, matching `stmEvaCoverage.ts`, `evaComparison.ts`, and `poiTraceability.ts`):

- **Sorting & Grouping Helpers**:
  - `getSortedMissionPriorityCategories(mission)` → categories sorted alphabetically (`localeCompare`), each containing its `MissionPriorityRowItem[]` sorted by `trace` with `{ numeric: true }` collation.
- **Action Collection for a Column**:
  - `getPriorityActionsForColumn({ mission, column, rexStatusFilter, includeDisabled })`:
    - Collects all actions belonging to the column's stations (`selectEvaStations`) and traverses (`selectEvaTraverses`) that have a resolved `missionPriorityUuid` — **including both `stmAction: true` and `stmAction: false`**.
    - Separates actions into `enabledActions` (filtered by `rexStatusFilter` when `column` is a REX or `campaignExecuted`) and `disabledActions` (`!action.enabled`) plus `filteredOutRexActions` (enabled actions excluded by `rexStatusFilter`, e.g., `skipped` or `pending` when `completeOnly` is selected).
- **Per-Column Rollup (`computePriorityColumnCoverage`)**:
  - For each `missionPriorityUuid` in `mission.missionPriorities`, computes `MissionPriorityCellCoverage`:
    - `priorityUuid: string`
    - `status: "complete" | "planned" | "inProgress" | "pending" | "skippedOnly" | "disabledOnly" | "none"`
      - For plan columns (`"eva"` | `"campaignPlanned"`):
        - `"planned"` if `activeCount > 0`
        - `"disabledOnly"` if `activeCount === 0 && disabledCount > 0`
        - `"none"` if both are `0`
      - For execution columns (`"rex"` | `"campaignExecuted"`):
        - Tracks counts by REX status (`completeCount`, `inProgressCount`, `pendingCount`, `skippedCount`, `disabledCount`).
        - `activeCount`: count of enabled actions matching `rexStatusFilter`.
        - Status rollups distinguish whether the priority has at least one `complete` action (`"complete"`), only `in-progress`/`pending` (`"inProgress"` / `"pending"`), only `skipped` (`"skippedOnly"`), only `disabled` (`"disabledOnly"`), or none (`"none"`).
    - `activeActionUuids: string[]` (enabled & passing `rexStatusFilter`)
    - `disabledActionUuids: string[]`
    - `excludedRexActionUuids: string[]` (e.g., skipped/pending when filtered out, so drilldown can still explain what happened)
- **Sub-Column Breakdown (Expanded Columns)**:
  - `groupPriorityMatchesBySequenceItem({ mission, cellCoverage, includeDisabled })` — per-station and per-traverse counts for expanded single EVA/REX columns (reusing `getEvaSequenceItems`).
  - `groupCampaignPriorityMatchesByMember({ mission, column, cellCoverage, includeDisabled })` — per-member EVA counts for expanded Campaign columns, distributing shared-station actions across member occurrences so sub-columns always sum to the Campaign total.
- **Diff & Baseline Comparison**:
  - `diffPriorityCell({ mission, baseline, other })`:
    - Computes `{ added: Action[], removed: Action[], matched: Action[], statusChanged: boolean, equal: boolean }`.
    - Pairs actions between baseline and target column: first by `refUuid` (which links an as-planned action directly to its REX duplicate!), then falling back to `actionDefinition` / `name` tuple pairing when comparing two different EVA plans.
    - Note: Pairing by `refUuid` first is a key improvement for Mission Priorities because when comparing `Campaign: Planned set` vs `Campaign: Executed set`, each REX action is a clone with the same `refUuid` as its planned station/traverse action.
  - `getPriorityCoverageDifferences({ mission, coverageByColumnKey, columns, baselineKey, priorityUuids })` — drives the `"Differences only"` checkbox (hiding priority rows and columns identical to baseline).
- **Mission-Wide / Unscheduled Context (`computePriorityUnscheduledUsages`)**:
  - For each priority UUID, finds:
    - `poiActionUuids: string[]` (actions on POIs, noting which ones have `0` station copies in `mission.actions`).
    - `unassignedLocationActionUuids: string[]` (actions on stations/traverses that do not belong to any as-planned EVA).
    - `actionTemplateUuids: string[]` (templates in `mission.actionTemplates` referencing this priority).
    - `plannedInAnyEvaCount: number` (total enabled actions across all as-planned EVAs).

### 2. Redux Store Integration: `src/store/report.ts` & `src/typings/store.d.ts`

- Extend `ColumnReportId`:
  ```ts
  type ColumnReportId = "stmCoverage" | "comparison" | "missionPriorities";
  type ReportsTab = "coverage" | "comparison" | "poiTrace" | "missionPriorities";
  ```
- Add `missionPriorities: ColumnReportState` to `ReportState` in `src/store/report.ts` (initialized with `initialColumnReportState()`).
- Extend `ColumnReportState` (or add optional fields) with:
  - `priorityCoverageByColumnKey?: { [columnKey: string]: { [priorityUuid: string]: MissionPriorityCellCoverage } }`
  - `includeDisabledActions?: boolean` (default `false` for active counts, while still badging `disabledOnly` cells, or toggleable in controls).
  - `collapsedPriorityCategories?: string[]` (for collapsing/expanding category sections on the left axis).

### 3. UI Components: `src/components/panes/reports/mission-priorities/`

Following the exact structure of `eva-stm-coverage/` and `eva-comparison/`:

1. **`mission-priorities-page.tsx`**
   - Wraps content in `<ReportIdProvider value="missionPriorities">`.
   - Renders shared `<ReportControls>` (Baseline dropdown, Diff toggle, Differences only, Include REX actions dropdown, View column chooser, Campaigns dialog, and `<MissionPrioritiesHelp />`).
   - Computes `allColumns`, `visibleColumns`, `baselineKey`, `priorityCoverageByColumnKey`, `sequenceByColumnKey`, `unscheduledByPriorityUuid`, and `visibleRowIds` via `useMemo` gated on a narrow `useMissionDocSelector` revision object (`missionPriorities`, `actions`, `actionTemplates`, `pois`, `stations`, `traverses`, `evas`, `rexes`, `reportCampaigns`).
   - Renders `<ReportColumnHeader leftAxis={<MissionPrioritiesHeaderLeftAxis />} />` and `<MissionPrioritiesTable />`.
   - Renders `<MissionPrioritiesDrilldown />` when `cellSelection` is non-null.

2. **`mission-priorities-table.tsx`**
   - Left axis renders collapsible **Category group headers** (similar to `EvaComparisonTable`'s `groupHeaderRow`, with a chevron and count of traces in that category) and **Priority trace rows** (`trace` badge + category context + optional unscheduled/POI-only indicator pill).
   - Right side of each row renders `groupCoverageColumns(visibleColumns)` with the standard `columnDivider` / `campaignDivider` and `<MissionPrioritiesColumnCells />`.

3. **`mission-priorities-cell.tsx`**
   - Renders the summary cell (and expanded station/traverse or campaign member sub-cells) using the shared `<BaseCell>`.
   - **Default (absolute) view**:
     - Plan column (`eva`, `campaignPlanned`):
       - `planned`: green cell (`styles.cellSatisfied`) showing count of enabled actions. (If disabled actions also exist, a small suffix or tooltip notes `+M disabled`).
       - `disabledOnly`: amber/muted cell showing `0 (D)` (or `D:M`) with tooltip explaining that only disabled actions carry this priority.
       - `none`: dim `0` (`styles.cellNone`).
     - Execution column (`rex`, `campaignExecuted`):
       - `complete`: green cell (`styles.cellSatisfied`) when ≥1 action is completed (and no enabled actions failed the filter, or all planned actions in the REX are complete).
       - `inProgress` / `pending`: blue partial cell (`styles.cellPartial`) when actions are in-progress or pending.
       - `skippedOnly`: red/negative-tinted cell when all actions for this priority in the REX were skipped.
       - `disabledOnly`: muted cell when only disabled actions exist.
       - `none`: dim `0`.
   - **Diff view (vs. baseline)**:
     - Uses the same `+A / −R` and `=` visual grammar as `EvaStmCoverageCell`, plus the blue status-changed outline (`styles.cellStatusChanged`) when a priority's status changes (e.g., from `planned` in `Campaign: Planned set` to `skippedOnly`, `disabledOnly`, or `none` in `Campaign: Executed set`).

4. **`mission-priorities-drilldown.tsx`**
   - Uses the shared `<ReportSidePanel>` and `<ReportActionTitle>` + `<ActionPreview>` modal (from `poi-traceability/action-preview.tsx`, hoisted to `reports/shared/action-preview.tsx` so both POI Traceability and Mission Priorities can preview any action in read-only mode!).
   - Displays:
     - **Header**: Priority `trace` + `category`, and the selected column / sub-column name.
     - **Changes only** toggle when Diff mode is active.
     - **In this column (EVA / REX / Campaign)**:
       - Grouped by member EVA (for campaigns) and station/traverse.
       - Each action row shows its station/traverse name, `<ReportActionTitle>`, its REX execution status badge (`Completed`, `In progress`, `Pending`, `Skipped`) when in a REX/Executed column, a `Disabled` badge if `!action.enabled`, and a `Preview` button opening `ActionPreview`.
       - If Diff mode is active: shows matched, `+` (added), and `−` (in baseline only) actions, noting if a baseline action was missing because its member EVA has no REX yet, was disabled, or was skipped.
     - **Other Mission Usages (Outside this Column)**:
       - Lists POI source actions (and whether they have been adopted into any station), unassigned station/traverse actions, and action templates that reference this `missionPriorityUuid`.

5. **`mission-priorities-help.tsx`**
   - Help dialog (`<dialog>`) following `EvaStmCoverageHelp`, explaining:
     - Priority categories & traces
     - EVA, REX, and Campaign (`Planned set` vs. `Executed set`) columns
     - Cell colors for Planned, Completed, Pending/In-Progress, Skipped, and Disabled-only states
     - Diff mode & Drilldown inspection

6. **Register Tab in `src/components/panes/reports/reports-page.tsx`**
   - Add `{ key: "missionPriorities", label: "Mission Priorities" }` to `TABS` and render `<MissionPrioritiesPage />`.

---

## Verification & Testing Plan

1. **Unit Tests (`src/tests/vitest/utils/missionPriorityReport.test.ts`)**:
   - Sorting of categories and numeric collation of traces (`SIMD-0002` before `SIMD-0010`).
   - Action eligibility on plan columns vs. REX columns: includes both `stmAction: true` and `stmAction: false` actions.
   - **Disabled action handling**:
     - A priority with only disabled actions in an EVA yields `status: "disabledOnly"`, `activeCount: 0`, `disabledCount: 1`.
     - A priority with 1 enabled and 1 disabled action yields `status: "planned"`, `activeCount: 1`, `disabledCount: 1`.
   - **REX status handling**:
     - `complete`, `in-progress`, `pending` (including sparse/missing `actionEntries`), and `skipped` actions roll up into the expected cell statuses and respect `rexStatusFilter`.
   - **Campaign columns (`campaignPlanned` and `campaignExecuted`)**:
     - Unions across member EVAs and resolved execution REXes (designated REX vs. latest REX fallback, skipping deleted EVAs).
     - Member EVA expansion sub-columns sum to the campaign total even when two EVAs share a station.
   - **Diff pairing (`diffPriorityCell`)**:
     - Pairs planned actions with their REX clones via `refUuid` and reports skipped/disabled/removed actions in `Campaign: Planned set` vs. `Campaign: Executed set`.
   - **Unscheduled / Non-EVA usages**:
     - Detects priorities assigned only to POI actions (never promoted), unassigned stations/traverses, and action templates.
2. **Browser / Component Tests (`src/tests/vitest-browser/Reports.browser.test.tsx`)**:
   - Switching to the `Mission Priorities` tab renders categories, trace rows, EVA/REX/Campaign columns, disabled-only indicators, and opens the drilldown side panel on cell click.
3. **Full Suite**:
   - Run `npm run test:all` (ESLint, TypeScript `tsc`, Vite build, Vitest unit & browser suites).

