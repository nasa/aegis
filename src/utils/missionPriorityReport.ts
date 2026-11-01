import { getAsPlannedEvaFromRefUuid, selectEvaStations, selectEvaTraverses } from "store/selectors";
import {
  actionBelongsToCampaignMember,
  getActionRexStatus,
  getAsPlannedEvas,
  getCampaignMemberItems,
  resolveCampaignExecutionRexes,
} from "utils/evaReportColumns";

/**
 * Pure computation module for the "Mission Priorities" report.
 *
 * Everything here is a plain function over (mission, column, ...) — no React,
 * no Redux, no Automerge handles.
 *
 * Types are declared ambiently in typings/missionPriorityReport.d.ts and typings/stm.d.ts.
 */

const PRIORITY_LABEL_REGEX = /^(?:pri\.?|priority|mission priority)$/i;
const PRIORITY_PREFIX_REGEX = /^(?:pri\.?|priority|mission priority)\s*:?\s+/i;

/**
 * Sort mission priority entries by category, then by trace within each category
 * with numeric collation (e.g. SIMD-0002 before SIMD-0010), matching
 * mission-right-missionPriorities.tsx.
 */
export const getSortedMissionPriorityCategories = (
  mission: Mission | null | undefined
): MissionPriorityCategoryGroup[] => {
  const entries = Object.entries(mission?.missionPriorities ?? {}).sort(
    ([uuidA, a], [uuidB, b]) => {
      const categoryComparison = a.category.localeCompare(b.category);
      if (categoryComparison !== 0) return categoryComparison;
      const traceComparison = a.trace.localeCompare(b.trace, undefined, { numeric: true });
      if (traceComparison !== 0) return traceComparison;
      return uuidA.localeCompare(uuidB);
    }
  );

  const groupsByCategory = new Map<string, MissionPriorityRowItem[]>();
  for (const [priorityUuid, priority] of entries) {
    const item: MissionPriorityRowItem = {
      priorityUuid,
      trace: priority.trace,
      category: priority.category,
    };
    const existing = groupsByCategory.get(priority.category);
    if (existing) existing.push(item);
    else groupsByCategory.set(priority.category, [item]);
  }

  return [...groupsByCategory.entries()].map(([category, items]) => ({
    category,
    items,
  }));
};

/**
 * Resolve the Mission Priority Identifier for an action or action template.
 * Primary match is `action.missionPriorityUuid`. When null on a v2 STM action,
 * checks if the mission encodes a legacy priority in the adjective slot and
 * maps it back to `mission.missionPriorities` when a matching trace exists.
 */
export const resolveActionMissionPriority = (
  action: Pick<Action, "missionPriorityUuid" | "stmAction" | "actionDefinition"> | undefined,
  mission: Mission | null | undefined
): ResolvedActionMissionPriority | null => {
  if (!action || !mission) return null;

  if (action.missionPriorityUuid) {
    const referenced = mission.missionPriorities?.[action.missionPriorityUuid];
    if (referenced) {
      return {
        priorityUuid: action.missionPriorityUuid,
        trace: referenced.trace,
        category: referenced.category,
        fromLegacyAdjective: false,
      };
    }
  }

  if (
    mission.actionSystemVersion === 2 &&
    action.stmAction &&
    action.actionDefinition &&
    mission.actionDefinitions
  ) {
    const { adjectiveUuid } = action.actionDefinition;
    const adjective = adjectiveUuid
      ? mission.actionDefinitions.adjectives?.[adjectiveUuid]?.name
      : undefined;
    const conjunctions = mission.actionDefinitionConjunctions;
    const labels = mission.actionDefinitionLabels;
    const adjectiveIsPriority =
      !!adjective &&
      (PRIORITY_LABEL_REGEX.test(conjunctions?.nounToAdjective?.trim() ?? "") ||
        PRIORITY_LABEL_REGEX.test(labels?.adjective?.singular?.trim() ?? "") ||
        PRIORITY_PREFIX_REGEX.test(adjective));

    if (adjectiveIsPriority && adjective) {
      const rawTrace = adjective.replace(PRIORITY_PREFIX_REGEX, "").trim();
      if (!rawTrace) return null;
      const lowerTrace = rawTrace.toLowerCase();
      for (const group of getSortedMissionPriorityCategories(mission)) {
        for (const item of group.items) {
          if (item.trace.trim().toLowerCase() === lowerTrace) {
            return {
              priorityUuid: item.priorityUuid,
              trace: item.trace,
              category: item.category,
              fromLegacyAdjective: true,
            };
          }
        }
      }
      return {
        priorityUuid: null,
        trace: rawTrace,
        category: "",
        fromLegacyAdjective: true,
      };
    }
  }

  return null;
};

type EvaluatedPriorityAction = {
  action: Action;
  priorityUuid: string;
  rex?: Rex;
  rexStatus: RexStatus | null;
  passesRexFilter: boolean;
};

const evaluatePriorityActionsForEva = ({
  mission,
  evaUuid,
  rex,
  rexStatusFilter,
}: {
  mission: Mission;
  evaUuid: string;
  rex?: Rex;
  rexStatusFilter: RexStatusFilter;
}): EvaluatedPriorityAction[] => {
  const stationUuids = new Set(selectEvaStations(mission, evaUuid).map((station) => station.uuid));
  const traverseUuids = new Set(
    selectEvaTraverses(mission, evaUuid).map((traverse) => traverse.uuid)
  );

  const results: EvaluatedPriorityAction[] = [];
  for (const action of Object.values(mission.actions ?? {})) {
    const inEva =
      (!!action.stationUuid && stationUuids.has(action.stationUuid)) ||
      (!!action.traverseUuid && traverseUuids.has(action.traverseUuid));
    if (!inEva) continue;

    const resolved = resolveActionMissionPriority(action, mission);
    if (!resolved?.priorityUuid) continue;

    const rexStatus = rex && action.enabled ? getActionRexStatus(rex, action.uuid) : null;
    let passesRexFilter = action.enabled;
    if (action.enabled && rex && rexStatusFilter !== "all") {
      passesRexFilter =
        rexStatusFilter === "notSkipped" ? rexStatus !== "skipped" : rexStatus === "complete";
    }

    results.push({
      action,
      priorityUuid: resolved.priorityUuid,
      rex,
      rexStatus,
      passesRexFilter,
    });
  }
  return results;
};

/**
 * Collect all actions (both STM and non-STM) in a column's stations and traverses
 * that resolve to a Mission Priority Identifier, partitioned into enabled
 * (passing `rexStatusFilter`), disabled (`!action.enabled`), and REX-filtered-out
 * actions.
 */
export const getPriorityActionsForColumn = ({
  mission,
  column,
  rexStatusFilter,
}: {
  mission: Mission;
  column: EvaReportColumn;
  rexStatusFilter: RexStatusFilter;
}): {
  enabledActions: Action[];
  disabledActions: Action[];
  filteredOutRexActions: Action[];
  evaluated: EvaluatedPriorityAction[];
} => {
  let evaluated: EvaluatedPriorityAction[] = [];

  if (!column.campaignUuid && column.evaUuid) {
    evaluated = evaluatePriorityActionsForEva({
      mission,
      evaUuid: column.evaUuid,
      rex: column.isRex ? mission.rexes?.[column.rexUuid ?? ""] : undefined,
      rexStatusFilter,
    });
  } else {
    const campaign = column.campaignUuid
      ? mission.reportCampaigns?.[column.campaignUuid]
      : undefined;
    if (campaign) {
      if (column.kind === "campaignPlanned") {
        evaluated = campaign.memberEvaUuids.flatMap((evaUuid) =>
          mission.evas?.[evaUuid]
            ? evaluatePriorityActionsForEva({ mission, evaUuid, rexStatusFilter })
            : []
        );
      } else if (column.kind === "campaignExecuted") {
        evaluated = resolveCampaignExecutionRexes(mission, campaign).flatMap((rex) =>
          mission.evas?.[rex.evaUuid]
            ? evaluatePriorityActionsForEva({
                mission,
                evaUuid: rex.evaUuid,
                rex,
                rexStatusFilter,
              })
            : []
        );
      }
    }
  }

  const enabledActions: Action[] = [];
  const disabledActions: Action[] = [];
  const filteredOutRexActions: Action[] = [];
  for (const item of evaluated) {
    if (!item.action.enabled) {
      disabledActions.push(item.action);
    } else if (item.passesRexFilter) {
      enabledActions.push(item.action);
    } else {
      filteredOutRexActions.push(item.action);
    }
  }

  return {
    enabledActions,
    disabledActions,
    filteredOutRexActions,
    evaluated,
  };
};

/**
 * Compute per-priority coverage rollups for one report column.
 */
export const computePriorityColumnCoverage = ({
  mission,
  column,
  rexStatusFilter,
}: {
  mission: Mission;
  column: EvaReportColumn;
  rexStatusFilter: RexStatusFilter;
}): { [priorityUuid: string]: MissionPriorityCellCoverage } => {
  const { evaluated } = getPriorityActionsForColumn({ mission, column, rexStatusFilter });
  const isExecutionColumn = column.kind === "rex" || column.kind === "campaignExecuted";

  const coverageByPriorityUuid: { [priorityUuid: string]: MissionPriorityCellCoverage } = {};
  for (const priorityUuid of Object.keys(mission?.missionPriorities ?? {})) {
    coverageByPriorityUuid[priorityUuid] = {
      priorityUuid,
      status: "none",
      activeCount: 0,
      disabledCount: 0,
      completeCount: 0,
      inProgressCount: 0,
      pendingCount: 0,
      skippedCount: 0,
      activeActionUuids: [],
      disabledActionUuids: [],
      excludedRexActionUuids: [],
    };
  }

  for (const item of evaluated) {
    const cell = coverageByPriorityUuid[item.priorityUuid];
    if (!cell) continue;
    if (!item.action.enabled) {
      cell.disabledCount += 1;
      cell.disabledActionUuids.push(item.action.uuid);
      continue;
    }

    if (isExecutionColumn) {
      if (item.rexStatus === "complete") cell.completeCount += 1;
      else if (item.rexStatus === "in-progress") cell.inProgressCount += 1;
      else if (item.rexStatus === "skipped") cell.skippedCount += 1;
      else cell.pendingCount += 1;
    }

    if (item.passesRexFilter) {
      cell.activeCount += 1;
      cell.activeActionUuids.push(item.action.uuid);
    } else {
      cell.excludedRexActionUuids.push(item.action.uuid);
    }
  }

  for (const cell of Object.values(coverageByPriorityUuid)) {
    if (!isExecutionColumn) {
      if (cell.activeCount > 0) cell.status = "planned";
      else if (cell.disabledCount > 0) cell.status = "disabledOnly";
      else cell.status = "none";
      continue;
    }

    const totalEnabledInRex =
      cell.completeCount + cell.inProgressCount + cell.pendingCount + cell.skippedCount;
    if (totalEnabledInRex === 0) {
      cell.status = cell.disabledCount > 0 ? "disabledOnly" : "none";
    } else if (cell.completeCount > 0) {
      cell.status = "complete";
    } else if (cell.inProgressCount > 0 && cell.activeCount > 0) {
      cell.status = "inProgress";
    } else if (cell.pendingCount > 0 && cell.activeCount > 0) {
      cell.status = "pending";
    } else if (cell.skippedCount === totalEnabledInRex) {
      cell.status = "skippedOnly";
    } else {
      cell.status = "none";
    }
  }

  return coverageByPriorityUuid;
};

/**
 * Per-station and per-traverse counts for one (priority, column) cell in the
 * expanded sub-column view.
 */
export const groupPriorityMatchesBySequenceItem = ({
  mission,
  cellCoverage,
  includeDisabled = false,
}: {
  mission: Mission;
  cellCoverage: MissionPriorityCellCoverage;
  includeDisabled?: boolean;
}): StmCoverageSequenceItemMatches => {
  const stations: { [stationUuid: string]: number } = {};
  const traverses: { [traverseUuid: string]: number } = {};
  const actionUuids = includeDisabled
    ? [...cellCoverage.activeActionUuids, ...cellCoverage.disabledActionUuids]
    : cellCoverage.activeActionUuids;

  for (const actionUuid of actionUuids) {
    const action = mission?.actions?.[actionUuid];
    if (!action) continue;
    if (action.stationUuid) {
      stations[action.stationUuid] = (stations[action.stationUuid] ?? 0) + 1;
    } else if (action.traverseUuid) {
      traverses[action.traverseUuid] = (traverses[action.traverseUuid] ?? 0) + 1;
    }
  }
  return { stations, traverses, evas: {} };
};

/**
 * Per-member EVA counts for an expanded Campaign column. Distributes shared
 * station/traverse action occurrences across member EVAs so sub-columns always
 * sum to the campaign total.
 */
export const groupCampaignPriorityMatchesByMember = ({
  mission,
  column,
  cellCoverage,
  includeDisabled = false,
}: {
  mission: Mission;
  column: EvaReportColumn;
  cellCoverage: MissionPriorityCellCoverage;
  includeDisabled?: boolean;
}): { [evaUuid: string]: number } => {
  const memberItems = getCampaignMemberItems(mission, column);
  const counts: { [evaUuid: string]: number } = Object.fromEntries(
    memberItems.map(({ uuid }) => [uuid, 0])
  );
  const occurrenceByActionUuid: { [actionUuid: string]: number } = {};
  const actionUuids = includeDisabled
    ? [...cellCoverage.activeActionUuids, ...cellCoverage.disabledActionUuids]
    : cellCoverage.activeActionUuids;

  for (const actionUuid of actionUuids) {
    const action = mission?.actions?.[actionUuid];
    if (!action) continue;
    const matchingMemberUuids = memberItems
      .map(({ uuid }) => uuid)
      .filter((memberEvaUuid) =>
        actionBelongsToCampaignMember({ mission, column, memberEvaUuid, action })
      );
    if (matchingMemberUuids.length === 0) continue;
    const occurrence = occurrenceByActionUuid[actionUuid] ?? 0;
    const memberEvaUuid = matchingMemberUuids[occurrence % matchingMemberUuids.length];
    counts[memberEvaUuid] += 1;
    occurrenceByActionUuid[actionUuid] = occurrence + 1;
  }

  return counts;
};

const actionFallbackKey = (action: Action): string => {
  if (action.stmAction && action.actionDefinition) {
    return `stm:${action.actionDefinition.verbUuid ?? ""}|${action.actionDefinition.nounUuid ?? ""}|${action.actionDefinition.adjectiveUuid ?? ""}`;
  }
  return `name:${(action.name ?? "").trim().toLowerCase()}`;
};

const normalizeStatusTier = (status: MissionPriorityCellStatus): string =>
  status === "planned" || status === "complete" ? "fulfilled" : status;

/**
 * Pairs active actions between a baseline cell and another column's cell:
 *  1. First pairs by `action.refUuid` (linking an as-planned action directly
 *     to its REX clone).
 *  2. Remaining unpaired actions fall back to pairing by STM
 *     verb|noun|adjective tuple or case-insensitive action name.
 */
export const diffPriorityActions = ({
  baselineActions,
  selectedActions,
}: {
  baselineActions: Action[];
  selectedActions: Action[];
}): { matched: Action[]; added: Action[]; removed: Action[] } => {
  const usedBaselineIndices = new Set<number>();
  const matchedSelectedIndices = new Set<number>();
  const matched: Action[] = [];
  const added: Action[] = [];

  // Pass 1: pair by refUuid when non-empty
  for (let sIndex = 0; sIndex < selectedActions.length; sIndex++) {
    const selected = selectedActions[sIndex];
    if (!selected.refUuid) continue;
    const bIndex = baselineActions.findIndex(
      (base, idx) => !usedBaselineIndices.has(idx) && base.refUuid === selected.refUuid
    );
    if (bIndex !== -1) {
      usedBaselineIndices.add(bIndex);
      matchedSelectedIndices.add(sIndex);
    }
  }

  // Pass 2: pair remaining by actionDefinition tuple or free-text name
  for (let sIndex = 0; sIndex < selectedActions.length; sIndex++) {
    if (matchedSelectedIndices.has(sIndex)) continue;
    const selected = selectedActions[sIndex];
    const key = actionFallbackKey(selected);
    const bIndex = baselineActions.findIndex(
      (base, idx) => !usedBaselineIndices.has(idx) && actionFallbackKey(base) === key
    );
    if (bIndex !== -1) {
      usedBaselineIndices.add(bIndex);
      matchedSelectedIndices.add(sIndex);
    }
  }

  for (let sIndex = 0; sIndex < selectedActions.length; sIndex++) {
    if (matchedSelectedIndices.has(sIndex)) matched.push(selectedActions[sIndex]);
    else added.push(selectedActions[sIndex]);
  }

  const removed = baselineActions.filter((_, idx) => !usedBaselineIndices.has(idx));
  return { matched, added, removed };
};

/**
 * Compares one priority cell in `other` against `baseline`.
 */
export const diffPriorityCell = ({
  mission,
  baseline,
  other,
}: {
  mission: Mission;
  baseline: MissionPriorityCellCoverage;
  other: MissionPriorityCellCoverage;
}): MissionPriorityCellDiff => {
  const resolveActions = (uuids: string[]): Action[] =>
    uuids.map((uuid) => mission?.actions?.[uuid]).filter((action): action is Action => !!action);

  const { matched, added, removed } = diffPriorityActions({
    baselineActions: resolveActions(baseline.activeActionUuids),
    selectedActions: resolveActions(other.activeActionUuids),
  });

  const statusChanged = normalizeStatusTier(baseline.status) !== normalizeStatusTier(other.status);
  const equal =
    !statusChanged &&
    added.length === 0 &&
    removed.length === 0 &&
    baseline.activeCount === other.activeCount &&
    baseline.disabledCount === other.disabledCount;

  return {
    matched,
    added,
    removed,
    statusChanged,
    equal,
  };
};

/**
 * Identifies priority rows and columns that differ from the baseline column in
 * at least one cell (drives the "Differences only" filter).
 */
export const getPriorityCoverageDifferences = ({
  mission,
  coverageByColumnKey,
  columns,
  baselineKey,
  priorityUuids,
}: {
  mission: Mission;
  coverageByColumnKey: {
    [columnKey: string]: { [priorityUuid: string]: MissionPriorityCellCoverage };
  };
  columns: EvaReportColumn[];
  baselineKey: string;
  priorityUuids: string[];
}): { priorityUuids: Set<string>; columnKeys: Set<string> } => {
  const differingPriorityUuids = new Set<string>();
  const columnKeys = new Set<string>();
  const baselineCoverage = coverageByColumnKey[baselineKey];
  if (!baselineCoverage) return { priorityUuids: differingPriorityUuids, columnKeys };

  for (const column of columns) {
    if (column.key === baselineKey) continue;
    for (const priorityUuid of priorityUuids) {
      const baseline = baselineCoverage[priorityUuid];
      const other = coverageByColumnKey[column.key]?.[priorityUuid];
      if (!baseline || !other) continue;
      const diff = diffPriorityCell({ mission, baseline, other });
      if (!diff.equal) {
        differingPriorityUuids.add(priorityUuid);
        columnKeys.add(column.key);
      }
    }
  }

  return { priorityUuids: differingPriorityUuids, columnKeys };
};

/**
 * Computes mission-wide non-EVA / unscheduled usages per priority UUID:
 *  - POI actions carrying the priority (and which ones have 0 station/traverse copies)
 *  - Unassigned station/traverse actions (on as-planned stations/traverses not in any EVA)
 *  - Action templates carrying the priority
 *  - Total enabled action occurrences across all as-planned EVAs
 */
export const computePriorityUnscheduledUsages = (
  mission: Mission | null | undefined
): { [priorityUuid: string]: MissionPriorityUnscheduledUsage } => {
  const result: { [priorityUuid: string]: MissionPriorityUnscheduledUsage } = {};
  if (!mission) return result;

  for (const priorityUuid of Object.keys(mission.missionPriorities ?? {})) {
    result[priorityUuid] = {
      priorityUuid,
      poiActionUuids: [],
      unpromotedPoiActionUuids: [],
      unassignedLocationActionUuids: [],
      actionTemplateUuids: [],
      plannedInAnyEvaCount: 0,
    };
  }

  const asPlannedEvas = getAsPlannedEvas(mission);
  const rexEvaUuidSet = new Set(Object.values(mission.rexes ?? {}).map((rex) => rex.evaUuid));

  const rexStationUuidSet = new Set<string>();
  const rexTraverseUuidSet = new Set<string>();
  for (const rexEvaUuid of rexEvaUuidSet) {
    for (const station of selectEvaStations(mission, rexEvaUuid)) {
      rexStationUuidSet.add(station.uuid);
    }
    for (const traverse of selectEvaTraverses(mission, rexEvaUuid)) {
      rexTraverseUuidSet.add(traverse.uuid);
    }
  }

  const plannedEvaStationSets = new Map<string, Set<string>>();
  const plannedEvaTraverseSets = new Map<string, Set<string>>();
  const allPlannedStationUuids = new Set<string>();
  const allPlannedTraverseUuids = new Set<string>();

  for (const eva of asPlannedEvas) {
    const stations = new Set(selectEvaStations(mission, eva.uuid).map((s) => s.uuid));
    const traverses = new Set(selectEvaTraverses(mission, eva.uuid).map((t) => t.uuid));
    plannedEvaStationSets.set(eva.uuid, stations);
    plannedEvaTraverseSets.set(eva.uuid, traverses);
    for (const uuid of stations) allPlannedStationUuids.add(uuid);
    for (const uuid of traverses) allPlannedTraverseUuids.add(uuid);
  }

  const parentUuidsWithCopies = new Set<string>();
  for (const action of Object.values(mission.actions ?? {})) {
    if (action.parentActionUuid && (action.stationUuid || action.traverseUuid)) {
      parentUuidsWithCopies.add(action.parentActionUuid);
    }
  }

  for (const action of Object.values(mission.actions ?? {})) {
    const resolved = resolveActionMissionPriority(action, mission);
    const priorityUuid = resolved?.priorityUuid;
    if (!priorityUuid || !result[priorityUuid]) continue;
    const usage = result[priorityUuid];

    if (action.poiUuid && mission.pois?.[action.poiUuid]) {
      usage.poiActionUuids.push(action.uuid);
      if (!parentUuidsWithCopies.has(action.uuid)) {
        usage.unpromotedPoiActionUuids.push(action.uuid);
      }
      continue;
    }

    if (action.stationUuid && mission.stations?.[action.stationUuid]) {
      if (rexStationUuidSet.has(action.stationUuid)) continue;
      if (!allPlannedStationUuids.has(action.stationUuid)) {
        usage.unassignedLocationActionUuids.push(action.uuid);
      } else if (action.enabled) {
        for (const eva of asPlannedEvas) {
          if (plannedEvaStationSets.get(eva.uuid)?.has(action.stationUuid)) {
            usage.plannedInAnyEvaCount += 1;
          }
        }
      }
      continue;
    }

    if (action.traverseUuid && mission.traverses?.[action.traverseUuid]) {
      if (rexTraverseUuidSet.has(action.traverseUuid)) continue;
      if (!allPlannedTraverseUuids.has(action.traverseUuid)) {
        usage.unassignedLocationActionUuids.push(action.uuid);
      } else if (action.enabled) {
        for (const eva of asPlannedEvas) {
          if (plannedEvaTraverseSets.get(eva.uuid)?.has(action.traverseUuid)) {
            usage.plannedInAnyEvaCount += 1;
          }
        }
      }
    }
  }

  for (const [templateUuid, template] of Object.entries(mission.actionTemplates ?? {})) {
    const resolved = resolveActionMissionPriority(template, mission);
    const priorityUuid = resolved?.priorityUuid;
    if (priorityUuid && result[priorityUuid]) {
      result[priorityUuid].actionTemplateUuids.push(templateUuid);
    }
  }

  return result;
};

/**
 * Explains why a baseline action is missing from the target column in Diff mode
 * (e.g. skipped, disabled, pending/in-progress in REX, or belongs to a campaign
 * member EVA with no execution REX yet).
 */
export const explainMissingBaselineAction = ({
  mission,
  baselineAction,
  targetColumn,
  priorityUuid,
}: {
  mission: Mission;
  baselineAction: Action;
  targetColumn: EvaReportColumn;
  priorityUuid: string;
}): string | null => {
  // Check if targetColumn is a REX or campaignExecuted where a refUuid clone exists
  const targetRexes: Rex[] = [];
  if (targetColumn.kind === "rex" && targetColumn.rexUuid) {
    const rex = mission.rexes?.[targetColumn.rexUuid];
    if (rex) targetRexes.push(rex);
  } else if (targetColumn.kind === "campaignExecuted" && targetColumn.campaignUuid) {
    const campaign = mission.reportCampaigns?.[targetColumn.campaignUuid];
    if (campaign) {
      targetRexes.push(...resolveCampaignExecutionRexes(mission, campaign));
    }
  }

  if (baselineAction.refUuid && targetRexes.length > 0) {
    for (const rex of targetRexes) {
      const stationUuids = new Set(selectEvaStations(mission, rex.evaUuid).map((s) => s.uuid));
      const traverseUuids = new Set(selectEvaTraverses(mission, rex.evaUuid).map((t) => t.uuid));
      const clone = Object.values(mission.actions ?? {}).find(
        (candidate) =>
          candidate.refUuid === baselineAction.refUuid &&
          ((!!candidate.stationUuid && stationUuids.has(candidate.stationUuid)) ||
            (!!candidate.traverseUuid && traverseUuids.has(candidate.traverseUuid)))
      );
      if (clone) {
        if (!clone.enabled) return "Disabled in execution";
        const resolved = resolveActionMissionPriority(clone, mission);
        if (resolved?.priorityUuid !== priorityUuid) {
          return resolved?.trace
            ? `Priority changed to ${resolved.trace} in execution`
            : "Priority cleared in execution";
        }
        const rexStatus = getActionRexStatus(rex, clone.uuid);
        if (rexStatus === "skipped") return "Skipped in execution";
        if (rexStatus === "in-progress") return "In progress (excluded by REX filter)";
        if (rexStatus === "pending") return "Pending (excluded by REX filter)";
      }
    }
  }

  // If comparing against campaignExecuted, check if the baseline action's member EVA has no REX
  if (targetColumn.kind === "campaignExecuted" && targetColumn.campaignUuid) {
    const campaign = mission.reportCampaigns?.[targetColumn.campaignUuid];
    if (campaign) {
      const executedEvaRefUuids = new Set(
        targetRexes.map((rex) => mission.evas?.[rex.evaUuid]?.refUuid).filter(Boolean)
      );
      const memberEvaUuid = campaign.memberEvaUuids.find((evaUuid) => {
        const eva = mission.evas?.[evaUuid];
        if (!eva || executedEvaRefUuids.has(eva.refUuid)) return false;
        const stationUuids = new Set(selectEvaStations(mission, evaUuid).map((s) => s.uuid));
        const traverseUuids = new Set(selectEvaTraverses(mission, evaUuid).map((t) => t.uuid));
        return (
          (!!baselineAction.stationUuid && stationUuids.has(baselineAction.stationUuid)) ||
          (!!baselineAction.traverseUuid && traverseUuids.has(baselineAction.traverseUuid))
        );
      });
      if (memberEvaUuid) {
        const evaName = mission.evas?.[memberEvaUuid]?.name ?? "EVA";
        return `${evaName}: no execution REX recorded`;
      }
    }
  }

  // Check if target column is a plan column that has a disabled copy of the same refUuid
  if (baselineAction.refUuid && targetColumn.evaUuid && !targetColumn.campaignUuid) {
    const stationUuids = new Set(
      selectEvaStations(mission, targetColumn.evaUuid).map((s) => s.uuid)
    );
    const traverseUuids = new Set(
      selectEvaTraverses(mission, targetColumn.evaUuid).map((t) => t.uuid)
    );
    const counterpart = Object.values(mission.actions ?? {}).find(
      (candidate) =>
        candidate.refUuid === baselineAction.refUuid &&
        ((!!candidate.stationUuid && stationUuids.has(candidate.stationUuid)) ||
          (!!candidate.traverseUuid && traverseUuids.has(candidate.traverseUuid)))
    );
    if (counterpart && !counterpart.enabled) {
      return "Disabled in this column";
    }
  }

  return null;
};

/**
 * Checks whether an action on a station or traverse was promoted from a POI
 * action whose priority differs from the action's current priority.
 */
export const getActionLineagePriorityMismatch = (
  action: Action | undefined,
  mission: Mission | null | undefined
): {
  poiActionUuid: string;
  poiName: string;
  poiPriorityTrace: string | null;
  currentPriorityTrace: string | null;
} | null => {
  if (!action?.parentActionUuid || !mission) return null;
  const poiAction = mission.actions?.[action.parentActionUuid];
  if (!poiAction) return null;

  const poiResolved = resolveActionMissionPriority(poiAction, mission);
  const currentResolved = resolveActionMissionPriority(action, mission);
  if ((poiResolved?.priorityUuid ?? null) === (currentResolved?.priorityUuid ?? null)) {
    return null;
  }

  const poiName = poiAction.poiUuid ? (mission.pois?.[poiAction.poiUuid]?.name ?? "POI") : "POI";

  return {
    poiActionUuid: poiAction.uuid,
    poiName,
    poiPriorityTrace: poiResolved?.trace ?? null,
    currentPriorityTrace: currentResolved?.trace ?? null,
  };
};

/** Helper to format the EVA / location prefix for an action in a column. */
export const getPriorityActionLocationLabel = (
  mission: Mission | undefined,
  column: EvaReportColumn | undefined,
  action: Action
): string => {
  if (!mission) return "";
  let memberPrefix = "";
  if (column?.campaignUuid) {
    const campaign = mission.reportCampaigns?.[column.campaignUuid];
    const memberEvaUuid = campaign?.memberEvaUuids.find((evaUuid) =>
      actionBelongsToCampaignMember({ mission, column, memberEvaUuid: evaUuid, action })
    );
    const memberEva = memberEvaUuid ? mission.evas?.[memberEvaUuid] : undefined;
    const memberName = memberEva
      ? (getAsPlannedEvaFromRefUuid(mission, memberEva.refUuid)?.name ?? memberEva.name)
      : null;
    if (memberName) memberPrefix = `${memberName} / `;
  }
  const locationName = action.stationUuid
    ? mission.stations?.[action.stationUuid]?.name
    : action.traverseUuid
      ? mission.traverses?.[action.traverseUuid]?.name
      : action.poiUuid
        ? mission.pois?.[action.poiUuid]?.name
        : "";
  return `${memberPrefix}${locationName ?? ""}`;
};
