import sortBy from "lodash/sortBy";
import { getSatisfiedActionsByRule } from "utils/stmRuleEngine";
import { selectEvaStations, selectEvaTraverses } from "store/selectors";

/**
 * Pure computation module for the STM Rules v2 "EVA Coverage" report.
 *
 * Everything here is a plain function over (mission, level3s, rules) — no React,
 * no Redux, no Automerge handles. Rules are passed in as plain STMRule[] so the
 * upcoming rules-to-Automerge migration only changes the caller's selector, not
 * this module.
 *
 * Types (StmCoverageEvaColumn, StmCoverageLevel3, RexStatusFilter, ...) are
 * declared ambiently in typings/stm.d.ts.
 */

/**
 * Builds the grid's columns: as-planned EVAs (sorted by name) followed by one
 * column per Rex (sorted by rex name — REX EVAs have a blank name, their
 * display name lives on the Rex).
 */
export const getEvaColumns = (mission: Mission): StmCoverageEvaColumn[] => {
  const rexes = Object.values(mission?.rexes ?? {});
  const rexEvaUuids = rexes.map((rex) => rex.evaUuid);

  const asPlannedEvas = sortBy(
    Object.values(mission?.evas ?? {}).filter((eva) => !rexEvaUuids.includes(eva.uuid)),
    [(eva) => eva.name.toLowerCase()]
  );
  const asPlannedColumns: StmCoverageEvaColumn[] = asPlannedEvas.map((eva) => ({
    key: eva.uuid,
    evaUuid: eva.uuid,
    isRex: false,
    label: eva.name,
  }));

  const rexColumns: StmCoverageEvaColumn[] = sortBy(rexes, [(rex) => rex.name.toLowerCase()])
    .filter((rex) => mission?.evas?.[rex.evaUuid])
    .map((rex) => ({
      key: rex.uuid,
      evaUuid: rex.evaUuid,
      isRex: true,
      rexUuid: rex.uuid,
      label: rex.name,
    }));

  return [...asPlannedColumns, ...rexColumns];
};

/**
 * Resolves the rexStatus of an action within a rex.
 * A null actionEntries record, missing entry, or null rexStatus all mean "pending".
 */
export const getActionRexStatus = (rex: Rex | undefined, actionUuid: string): RexStatus => {
  return rex?.actionEntries?.[actionUuid]?.rexStatus ?? "pending";
};

/**
 * All actions in a column's EVA that are eligible for rule matching:
 * stmAction, enabled, parented by one of the EVA's stations or traverses, and
 * (for REX columns) passing the rex-status filter.
 */
export const getEligibleActionsForColumn = ({
  mission,
  column,
  rexStatusFilter,
}: {
  mission: Mission;
  column: StmCoverageEvaColumn;
  rexStatusFilter: RexStatusFilter;
}): Action[] => {
  const stationUuids = new Set(
    selectEvaStations(mission, column.evaUuid).map((station) => station.uuid)
  );
  const traverseUuids = new Set(
    selectEvaTraverses(mission, column.evaUuid).map((traverse) => traverse.uuid)
  );

  const rex = column.isRex && column.rexUuid ? mission?.rexes?.[column.rexUuid] : undefined;

  return Object.values(mission?.actions ?? {}).filter((action) => {
    if (!action.stmAction || !action.enabled) return false;
    const inEva =
      (action.stationUuid && stationUuids.has(action.stationUuid)) ||
      (action.traverseUuid && traverseUuids.has(action.traverseUuid));
    if (!inEva) return false;
    if (column.isRex && rexStatusFilter !== "all") {
      const rexStatus = getActionRexStatus(rex, action.uuid);
      if (rexStatusFilter === "notSkipped") return rexStatus !== "skipped";
      if (rexStatusFilter === "completeOnly") return rexStatus === "complete";
    }
    return true;
  });
};

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
  column: StmCoverageEvaColumn;
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
 * Per-station match counts for one (level3, column) cell, for the expanded
 * per-station sub-column view. Counts match instances the same way
 * totalMatches does, so stations + traverseTotal always sum to totalMatches.
 */
export const groupMatchesBySequenceItem = ({
  mission,
  level3Coverage,
}: {
  mission: Mission;
  level3Coverage: StmCoverageLevel3;
}): StmCoverageSequenceItemMatches => {
  const stations: { [stationUuid: string]: number } = {};
  let traverseTotal = 0;
  for (const ruleCoverage of level3Coverage.rules) {
    for (const actionUuid of ruleCoverage.matchingActionUuids) {
      const action = mission?.actions?.[actionUuid];
      if (!action) continue;
      if (action.stationUuid) {
        stations[action.stationUuid] = (stations[action.stationUuid] ?? 0) + 1;
      } else if (action.traverseUuid) {
        traverseTotal += 1;
      }
    }
  }
  return { stations, traverseTotal };
};
