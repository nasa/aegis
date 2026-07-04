# STM Rules v2: EVA Coverage Report + Rules Management Redesign

This document describes the design of the version-2 STM (Science Traceability
Matrix) satisfaction-rules reporting and management UI: the tabbed STM
Satisfaction Rules pane, the per-rule "Rule Matches" report, and the "EVA
Coverage" grid that lets flight controllers compare STM coverage across EVA
plans and executions.

## Background

AEGIS has two per-mission action system versions (`Mission.actionSystemVersion`):

- **v1 (legacy)** links actions directly to STM level-3 items via
  `Action.stmPriorities` and reports through the `stm-viewer` pane (STM
  hierarchy down the left, stations across the top). v1 is frozen: its code
  and Redux state (`stmView*`) are never shared with v2 — any pattern v2
  borrows (22px grid rhythm, rotated column labels, crosshair hover) is
  duplicated, not imported.
- **v2** defines *satisfaction rules* per STM level-3 item. A rule reads
  "**count** × **verbs** OF **nouns** IN **adjectives**" and is evaluated
  against the verb/noun/adjective `actionDefinition` of actions via
  `src/utils/stmRuleEngine.ts` (json-logic). Before this work, v2's only
  report was a per-rule details modal, and rule editing was only reachable
  through that modal.

The driving requirement: flight controllers need a report **by EVA** — both
as-planned EVAs and REX (execution) EVAs — summarizing how all the actions in
each EVA contribute to satisfying each STM item, so that two similar EVA plans
can be compared and the *source* of coverage differences located.

## Satisfaction semantics

For one STM level-3 item within one EVA column:

- **Eligible actions**: `stmAction === true`, `enabled`, parented by one of
  the EVA's stations (`selectEvaStations`, includes non-lander
  ingress/egress) or traverses (`selectEvaTraverses`). For REX columns an
  additional rex-status filter applies (see below).
- **Per rule**: `matches` = rule engine over the eligible actions. The rule
  is *satisfied* when `matches.length >= rule.count`.
- **Level-3 rollup**:
  - `satisfied` — every rule satisfied
  - `partial` — at least one match, but not all rules satisfied
  - `none` — zero matches across all rules
  - `noRules` — the item has no rules (neutral "—" cell, excluded from diffs)
- **Totals count match instances**: an action matching two rules counts
  twice, so per-station breakdowns always sum to the column total.
- **REX status filter** (user toggle): `all` / `notSkipped`
  (`rexStatus !== "skipped"`) / `completeOnly` (`rexStatus === "complete"`).
  A null `Rex.actionEntries`, a missing entry, or a null `rexStatus` all mean
  `pending`.
- **Diff vs baseline** (per level3): delta of total matches, plus a
  status-change highlight. Two cells are *equal* only when the per-rule match
  counts are identical — the same total from a different rule distribution
  renders as `≠`.

Engine caveat (asserted in unit tests): an action missing an
`actionDefinition` dimension never matches, including `*Any` wildcard rules —
json-logic `!!` on a missing var is false.

## Architecture

### Pure computation module

`src/utils/stmEvaCoverage.ts` — no React/Redux/Automerge imports. Rules are
passed in as plain `STMRule[]`, so the planned migration of rules from
REST/Redux to Automerge only changes the caller's selector, not this module.

- `getEvaColumns(mission)` — as-planned EVAs (sorted by name), then one
  column per Rex (sorted by rex name; REX EVAs have blank names — the display
  name lives on the Rex). An EVA referenced by multiple rexes yields one
  column per rex; columns are keyed by evaUuid (as-planned) or rexUuid (REX).
- `getEligibleActionsForColumn({mission, column, rexStatusFilter})`
- `computeColumnCoverage({mission, level3s, rules, column, rexStatusFilter})`
  → `{ [stmUuid]: StmCoverageLevel3 }`
- `diffLevel3(baseline, other)` → `{ delta, statusChanged, equal }`
- `groupMatchesBySequenceItem({mission, level3Coverage})` — per-station match
  counts + traverse total for the expanded-column view; derived from the
  already-computed matches, never re-runs the engine.

Ambient types (`StmCoverageEvaColumn`, `StmCoverageLevel3`, `StmCoverageRule`,
`RexStatusFilter`, ...) live in `src/typings/stm.d.ts`. Unit tests:
`src/tests/vitest/utils/stmEvaCoverage.test.ts`.

### Redux state (UI only)

All new keys in the `stm` slice (`src/store/stm.ts`) are v2-owned and
deliberately separate from v1's `stmView*` keys:

- `stmRulesActiveTab` — `"rules" | "matches" | "coverage"`
- `stmRulesSelectedRuleUuid` — drives the Rule Matches tab
- `stmRulesTierExpansion` — per-tier (level1/level2) name-column expansion,
  shared by the Rules and Coverage tabs so the hierarchy stays visually
  stable across tabs
- `stmCoverageBaselineColumnKey`, `stmCoverageDiffMode`,
  `stmCoverageDifferencesOnly`, `stmCoverageRexStatusFilter`,
  `stmCoverageHiddenColumns`, `stmCoverageExpandedEvaColumns`,
  `stmCoverageHoveredTopItem/LeftItem` (crosshair)

### Pane structure

`src/components/panes/stm-rules/`:

| File | Role |
| --- | --- |
| `stm-rules-page.tsx` | Tab shell: **Rules \| Rule Matches \| EVA Coverage** |
| `stm-rules-tier-titles.tsx` | Clickable tier column headers + shared `useStmTierExpansion()` |
| `stm-rules-tab-rules.tsx` | Rules tab: header titles + STM list table |
| `stm-rules-list-table.tsx` | STM hierarchy with per-level3 rules |
| `stm-rules-rules.tsx` | Rule rows with inline editing + per-rule buttons |
| `stm-rules-tab-matches.tsx` | Rule Matches tab (replaces the old details modal) |
| `stm-coverage/stm-coverage-page.tsx` | Coverage orchestrator: computes columns/coverage/diffs, provides context |
| `stm-coverage/stm-coverage-controls.tsx` | Baseline dropdown, Diff toggle, Differences-only, REX filter, column multiselect |
| `stm-coverage/stm-coverage-header.tsx` | Sticky column headers, As-Planned/REX groups, expand-into-stations toggles |
| `stm-coverage/stm-coverage-table.tsx` | STM hierarchy rows + per-row cells |
| `stm-coverage/stm-coverage-cell.tsx` | Summary/diff cells and per-station sub-cells |
| `stm-coverage/stm-coverage-drilldown.tsx` | Per-cell side panel: per-rule counts, matching actions, baseline comparison |

## UX decisions

- **Tabs, not a new pane**: the `stmRules` pane registration in
  `_paneTypes.ts` is unchanged; navigation between rules management and the
  two reports happens with tabs inside the pane.
- **Tier expansion moved into the table**: the old top-left button (which
  globally collapsed the level1/level2 name columns via v1 state) was
  removed. Clicking a tier's column header — or any level1/level2 cell —
  toggles that tier independently. The freed header space hosts the tab bar.
- **Inline rule editing (transitional)**: each rule row has explicit
  Matches / Edit / Delete buttons; Edit switches the row to inline editors
  with Save/Cancel (single-rule-at-a-time via `ruleEditingUuid`). A newly
  created rule enters edit mode immediately. This per-rule Edit/Save
  interaction intentionally mirrors current STM editing and will be replaced
  by the universal header edit mode when rules move to Automerge — the wiring
  is kept thin so that swap is a small diff.
- **Rule Matches is a tab, not a modal**: the old `<dialog>` report
  (stations/traverses/rex contribution buckets, rex multiselect) moved into
  `stm-rules-tab-matches.tsx`. The modal files were deleted along with their
  editing stubs. Level3 selection uses the same full STM hierarchy table as
  the Rules tab (`STMRulesTable` in `selectMode`: rules column hidden, level3
  rows clickable/highlighted). All rules of the selected level3 are listed at
  once on the right — no "Rule N of M" pager — and clicking a rule shows its
  match report below.
- **Station granularity lives inside the EVA Coverage tab** (no fourth tab):
  each EVA column header has a +/− toggle that expands the column into
  per-station sub-columns (sequence order) plus a "Traverses" sub-column and
  a Total column — reproducing the v1 EVA-grouped station grid with v2 rule
  semantics. Sub-cells always sum to the Total, so controllers can see
  exactly which station a coverage difference comes from.
- **Diff stays EVA-level**: expanded station sub-cells always show absolute
  counts (stations don't align 1:1 across EVAs); the delta is shown on the
  summary/Total cell. Cell click opens the drilldown, which shows per-rule
  `matched / required` alongside the baseline's counts.

## Edge cases

- Level3 with zero rules → `noRules` "—" cell, never flagged as a difference.
- EVA with no stations/actions → all `none`.
- `Rex.actionEntries === null` → every action `pending`.
- Baseline hidden or deleted → falls back to the first visible column.
- Mission with no rexes → as-planned columns only; the REX filter is hidden.
- Rex pointing at a deleted EVA → column skipped.

## Upcoming migration notes

STM rules currently live in Redux (`state.stm.rules`) backed by REST/Postgres
(`/api/v1/stmRules`). A subsequent branch moves them into the Automerge
mission document. Impact here is intentionally minimal:

- `stmEvaCoverage.ts` takes rules as a parameter — one selector change.
- Rule editing thunks (`thunkSaveStmRule` etc.) and the inline Edit/Save
  buttons are the only REST-coupled pieces; both are replaced wholesale by
  Automerge mutations + the universal edit mode.

## Verification

- `npm run test:vitest` — includes `stmEvaCoverage.test.ts` (satisfaction
  rollups, rex-status filters, wildcard/missing-definition behavior, diff
  equality, station grouping invariant).
- `npm run test:all` — lint + tsc + build + unit tests.
- Manual: on a v2 mission, exercise inline rule add/edit/save/cancel/delete;
  the Matches button navigation; baseline switching, diff/absolute,
  differences-only, REX status filter, column expand-into-stations (sub-cells
  sum to Total), and the cell drilldown. On a v1 mission, confirm the
  stm-viewer pane is untouched.
