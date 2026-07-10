import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import { getEligibleActionsForColumn } from "utils/evaReportColumns";

/**
 * Pure computation module for the STM Rules v2 "EVA Coverage" report.
 *
 * Everything here is a plain function over (mission, level3s, rules) — no React,
 * no Redux, no Automerge handles. Rules are passed in as plain STMRule[] so the
 * upcoming rules-to-Automerge migration only changes the caller's selector, not
 * this module.
 *
 * Types (EvaReportColumn, StmCoverageLevel3, RexStatusFilter, ...) are
 * declared ambiently in typings/stm.d.ts.
 */

/**
 * Computes the StmCoverageLevel3 for every level3, for one EVA column.
 */
export const computeColumnCoverage = ({
  mission,
  level3s,
  rules,
  column,
  rexStatusFilter,
}: {
  mission: Mission;
  level3s: STMLevel3[];
  rules: STMRule[];
  column: EvaReportColumn;
  rexStatusFilter: RexStatusFilter;
}): { [stmUuid: string]: StmCoverageLevel3 } => {
  const eligibleActions = getEligibleActionsForColumn({ mission, column, rexStatusFilter });

  const coverageByStmUuid: { [stmUuid: string]: StmCoverageLevel3 } = {};
  for (const level3 of level3s) {
    const level3Rules = rules.filter((rule) => rule.stmUuid === level3.uuid);
    if (level3Rules.length === 0) {
      coverageByStmUuid[level3.uuid] = {
        stmUuid: level3.uuid,
        status: "noRules",
        rules: [],
        totalMatches: 0,
      };
      continue;
    }

    const ruleCoverages: StmCoverageRule[] = level3Rules.map((rule) => {
      const matches = getSatisfiedActionsByRule({ rule, actionsToConsider: eligibleActions });
      return {
        ruleUuid: rule.uuid,
        matchCount: matches.length,
        required: rule.count,
        satisfied: matches.length >= rule.count,
        matchingActionUuids: matches.map((action) => action.uuid),
      };
    });

    const totalMatches = ruleCoverages.reduce((acc, rc) => acc + rc.matchCount, 0);
    const allSatisfied = ruleCoverages.every((rc) => rc.satisfied);
    coverageByStmUuid[level3.uuid] = {
      stmUuid: level3.uuid,
      status: allSatisfied ? "satisfied" : totalMatches > 0 ? "partial" : "none",
      rules: ruleCoverages,
      totalMatches,
    };
  }
  return coverageByStmUuid;
};

/**
 * Compares one level3's coverage in a column against the baseline column.
 * `equal` means identical per-rule match counts (used by the "differences only"
 * row filter), not merely an equal total.
 */
export const diffLevel3 = (
  baseline: StmCoverageLevel3,
  other: StmCoverageLevel3
): { delta: number; statusChanged: boolean; equal: boolean } => {
  const delta = other.totalMatches - baseline.totalMatches;
  const statusChanged = baseline.status !== other.status;

  const baselineCountsByRule: { [ruleUuid: string]: number } = {};
  for (const rc of baseline.rules) baselineCountsByRule[rc.ruleUuid] = rc.matchCount;
  const sameRuleCounts =
    baseline.rules.length === other.rules.length &&
    other.rules.every((rc) => baselineCountsByRule[rc.ruleUuid] === rc.matchCount);

  return { delta, statusChanged, equal: !statusChanged && sameRuleCounts };
};

/**
 * Pairs one rule's matching actions between the baseline column and a selected
 * cell for the drilldown's action-level diff. Actions pair by their
 * actionDefinition tuple (verb|noun|adjective) only — station/traverse never
 * participates, so the same task at a different station still counts as
 * matched. Pairing is multiset-style: each baseline action pairs with at most
 * one selected action (2 identical tuples in baseline + 3 in selected → 2
 * matched + 1 added). Actions with a null actionDefinition all share the empty
 * tuple and pair with each other. Callers resolve uuids to Actions (dropping
 * deleted ones) before calling. `added` keeps selected-input order; `removed`
 * keeps baseline-input order.
 */
export const diffRuleActions = ({
  baselineActions,
  selectedActions,
}: {
  baselineActions: Action[];
  selectedActions: Action[];
}): StmCoverageRuleActionDiff => {
  const tupleKey = (action: Action): string =>
    `${action.actionDefinition?.verbUuid ?? ""}|${action.actionDefinition?.nounUuid ?? ""}|${action.actionDefinition?.adjectiveUuid ?? ""}`;

  const unpairedBaseline = new Map<string, Action[]>();
  for (const action of baselineActions) {
    const key = tupleKey(action);
    const queue = unpairedBaseline.get(key);
    if (queue) queue.push(action);
    else unpairedBaseline.set(key, [action]);
  }

  const matched: Action[] = [];
  const added: Action[] = [];
  for (const action of selectedActions) {
    const queue = unpairedBaseline.get(tupleKey(action));
    if (queue && queue.length > 0) {
      queue.shift();
      matched.push(action);
    } else {
      added.push(action);
    }
  }

  const removed = baselineActions.filter((action) => {
    const queue = unpairedBaseline.get(tupleKey(action));
    if (!queue || queue[0] !== action) return false;
    queue.shift();
    return true;
  });

  return { matched, added, removed };
};

/**
 * Total added/removed action counts for one level3 cell vs the baseline,
 * summed over the per-rule tuple pairing of diffRuleActions — so the cell's
 * "+A −R" always agrees with the rows the drilldown lists. Rules present in
 * only one coverage (shouldn't happen — both are computed from the same rules
 * array — but guarded anyway) count wholly as added/removed. Deleted actions
 * are skipped on both sides.
 */
export const diffLevel3Actions = ({
  mission,
  baseline,
  other,
}: {
  mission: Mission;
  baseline: StmCoverageLevel3;
  other: StmCoverageLevel3;
}): { added: number; removed: number } => {
  const resolve = (actionUuids: string[]): Action[] =>
    actionUuids
      .map((actionUuid) => mission?.actions?.[actionUuid])
      .filter((action): action is Action => !!action);

  const baselineByRule: { [ruleUuid: string]: StmCoverageRule } = {};
  for (const rc of baseline.rules) baselineByRule[rc.ruleUuid] = rc;

  let added = 0;
  let removed = 0;
  const seenRuleUuids = new Set<string>();
  for (const rc of other.rules) {
    seenRuleUuids.add(rc.ruleUuid);
    const diff = diffRuleActions({
      baselineActions: resolve(baselineByRule[rc.ruleUuid]?.matchingActionUuids ?? []),
      selectedActions: resolve(rc.matchingActionUuids),
    });
    added += diff.added.length;
    removed += diff.removed.length;
  }
  for (const rc of baseline.rules) {
    if (!seenRuleUuids.has(rc.ruleUuid)) removed += resolve(rc.matchingActionUuids).length;
  }
  return { added, removed };
};

/**
 * The level3 rows and columns that differ from the baseline column in at
 * least one cell. Drives the "differences only" filter, which hides rows AND
 * columns whose coverage is identical to the baseline everywhere (with many
 * columns almost every row differs somewhere, so filtering rows alone rarely
 * removes anything). A cell also counts as different when its per-rule counts
 * equal the baseline's but the underlying verb/noun/adjective tuples differ
 * (diffLevel3Actions), so rows the cells render as "+N −N" are never hidden.
 * The baseline column is never included in `columnKeys`; callers keep it
 * visible unconditionally.
 */
export const getCoverageDifferences = ({
  mission,
  coverageByColumnKey,
  columns,
  baselineKey,
  level3s,
}: {
  mission: Mission;
  coverageByColumnKey: { [columnKey: string]: { [stmUuid: string]: StmCoverageLevel3 } };
  columns: EvaReportColumn[];
  baselineKey: string;
  level3s: STMLevel3[];
}): { stmUuids: Set<string>; columnKeys: Set<string> } => {
  const stmUuids = new Set<string>();
  const columnKeys = new Set<string>();
  const baselineCoverage = coverageByColumnKey[baselineKey];
  if (!baselineCoverage) return { stmUuids, columnKeys };

  for (const column of columns) {
    if (column.key === baselineKey) continue;
    for (const level3 of level3s) {
      const baseline = baselineCoverage[level3.uuid];
      const other = coverageByColumnKey[column.key]?.[level3.uuid];
      if (!baseline || !other) continue;
      let differs = !diffLevel3(baseline, other).equal;
      if (!differs) {
        const { added, removed } = diffLevel3Actions({ mission, baseline, other });
        differs = added > 0 || removed > 0;
      }
      if (differs) {
        stmUuids.add(level3.uuid);
        columnKeys.add(column.key);
      }
    }
  }
  return { stmUuids, columnKeys };
};

/**
 * Per-station and per-traverse match counts for one (level3, column) cell, for
 * the expanded sub-column view. Counts match instances the same way
 * totalMatches does, so stations + traverses always sum to totalMatches.
 */
export const groupMatchesBySequenceItem = ({
  mission,
  level3Coverage,
}: {
  mission: Mission;
  level3Coverage: StmCoverageLevel3;
}): StmCoverageSequenceItemMatches => {
  const stations: { [stationUuid: string]: number } = {};
  const traverses: { [traverseUuid: string]: number } = {};
  for (const ruleCoverage of level3Coverage.rules) {
    for (const actionUuid of ruleCoverage.matchingActionUuids) {
      const action = mission?.actions?.[actionUuid];
      if (!action) continue;
      if (action.stationUuid) {
        stations[action.stationUuid] = (stations[action.stationUuid] ?? 0) + 1;
      } else if (action.traverseUuid) {
        traverses[action.traverseUuid] = (traverses[action.traverseUuid] ?? 0) + 1;
      }
    }
  }
  return { stations, traverses, evas: {} };
};

/**
 * The sub-columns of an expanded EVA column: stations AND traverses in EVA
 * sequence order (mirroring how the Matches tab renders an EVA sequence),
 * followed by any non-lander ingress/egress stations that aren't already in
 * the sequence. The station set matches selectEvaStations and the traverse set
 * matches selectEvaTraverses, so the sub-cell counts always sum to the
 * column's Total. Deduped by uuid so revisited stations get a single column.
 */
export const getEvaSequenceItems = (
  mission: Mission,
  evaUuid: string
): StmCoverageSequenceItem[] => {
  const eva = mission?.evas?.[evaUuid];
  if (!eva) return [];

  const items: StmCoverageSequenceItem[] = [];
  const seenUuids = new Set<string>();
  const pushStation = (stationUuid: string): void => {
    const station = mission?.stations?.[stationUuid];
    if (!station || seenUuids.has(station.uuid)) return;
    seenUuids.add(station.uuid);
    items.push({ type: "station", uuid: station.uuid, name: station.name, icon: station.icon });
  };

  for (const sequenceItem of eva.sequence ?? []) {
    if (sequenceItem.type === "station") {
      pushStation(sequenceItem.uuid);
    } else {
      const traverse = mission?.traverses?.[sequenceItem.uuid];
      if (!traverse || seenUuids.has(traverse.uuid)) continue;
      seenUuids.add(traverse.uuid);
      items.push({ type: "traverse", uuid: traverse.uuid, name: traverse.name });
    }
  }
  if (eva.ingressLocationUuid !== "lander") pushStation(eva.ingressLocationUuid);
  if (eva.egressLocationUuid !== "lander") pushStation(eva.egressLocationUuid);

  return items;
};
