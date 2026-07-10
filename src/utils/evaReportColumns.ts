import sortBy from "lodash/sortBy";
import { getAsPlannedEvaFromRefUuid, selectEvaStations, selectEvaTraverses } from "store/selectors";

/** Shared EVA-family column machinery used by reporting views. */

export const STM_COVERAGE_ORPHAN_GROUP_KEY = "__orphanRexes__";
export const STM_COVERAGE_ORPHAN_GROUP_LABEL = "Other REXes";

/** As-planned EVAs in the same case-insensitive name order used by EVA Coverage. */
export const getAsPlannedEvas = (mission: Mission): Eva[] => {
  const rexEvaUuids = new Set(Object.values(mission.rexes ?? {}).map((rex) => rex.evaUuid));
  return sortBy(
    Object.values(mission.evas ?? {}).filter((eva) => !rexEvaUuids.has(eva.uuid)),
    [(eva) => eva.name.toLowerCase()]
  );
};

/** REXes associated with one as-planned EVA, newest first. */
export const getExecutionRexesForEva = (mission: Mission, evaUuid: string): Rex[] => {
  const asPlannedEva = mission.evas?.[evaUuid];
  if (!asPlannedEva) return [];
  return Object.values(mission.rexes ?? {})
    .filter((rex) => mission.evas?.[rex.evaUuid]?.refUuid === asPlannedEva.refUuid)
    .sort((a, b) => {
      const createdAtDifference =
        (b.createdAt ?? Number.NEGATIVE_INFINITY) - (a.createdAt ?? Number.NEGATIVE_INFINITY);
      return createdAtDifference || b.uuid.localeCompare(a.uuid);
    });
};

/** Resolve one execution per surviving campaign member, preserving member order. */
export const resolveCampaignExecutionRexes = (
  mission: Mission,
  campaign: ReportCampaign
): Rex[] => {
  const resolved: Rex[] = [];
  for (const evaUuid of campaign.memberEvaUuids) {
    if (!mission.evas?.[evaUuid]) continue;
    const candidates = getExecutionRexesForEva(mission, evaUuid);
    if (candidates.length === 0) continue;
    const designatedRexUuid = campaign.executionRexUuidByEvaUuid?.[evaUuid];
    resolved.push(candidates.find((rex) => rex.uuid === designatedRexUuid) ?? candidates[0]);
  }
  return resolved;
};

/** Build report columns: EVA families first, then one planned/executed pair per campaign. */
export const getEvaColumns = (mission: Mission): EvaReportColumn[] => {
  const rexes = sortBy(Object.values(mission.rexes ?? {}), [(rex) => rex.name.toLowerCase()]);
  const asPlannedEvas = getAsPlannedEvas(mission);

  const rexColumn = (rex: Rex, groupKey: string, groupLabel: string): EvaReportColumn => ({
    key: rex.uuid,
    kind: "rex",
    evaUuid: rex.evaUuid,
    isRex: true,
    rexUuid: rex.uuid,
    label:
      getAsPlannedEvaFromRefUuid(mission, mission.evas?.[rex.evaUuid]?.refUuid ?? "")?.name ??
      rex.name,
    groupKey,
    groupLabel,
  });

  const asPlannedEvaByRexUuid = new Map<string, Eva | undefined>();
  for (const rex of rexes) {
    const rexEva = mission.evas?.[rex.evaUuid];
    asPlannedEvaByRexUuid.set(
      rex.uuid,
      rexEva ? getAsPlannedEvaFromRefUuid(mission, rexEva.refUuid) : undefined
    );
  }

  const groupedRexUuids = new Set<string>();
  const columns: EvaReportColumn[] = [];
  for (const eva of asPlannedEvas) {
    columns.push({
      key: eva.uuid,
      kind: "eva",
      evaUuid: eva.uuid,
      isRex: false,
      label: eva.name,
      groupKey: eva.uuid,
      groupLabel: eva.name,
    });
    for (const rex of rexes) {
      if (groupedRexUuids.has(rex.uuid)) continue;
      if (asPlannedEvaByRexUuid.get(rex.uuid)?.uuid === eva.uuid) {
        groupedRexUuids.add(rex.uuid);
        columns.push(rexColumn(rex, eva.uuid, eva.name));
      }
    }
  }

  for (const rex of rexes) {
    if (!groupedRexUuids.has(rex.uuid) && mission.evas?.[rex.evaUuid]) {
      columns.push(rexColumn(rex, STM_COVERAGE_ORPHAN_GROUP_KEY, STM_COVERAGE_ORPHAN_GROUP_LABEL));
    }
  }

  const campaigns = sortBy(Object.values(mission.reportCampaigns ?? {}), [
    (campaign) => campaign.name.toLowerCase(),
  ]);
  for (const campaign of campaigns) {
    const groupKey = `campaign:${campaign.uuid}`;
    columns.push({
      key: `${groupKey}:planned`,
      kind: "campaignPlanned",
      isRex: false,
      campaignUuid: campaign.uuid,
      label: "Planned set",
      groupKey,
      groupLabel: campaign.name,
    });
    columns.push({
      key: `${groupKey}:executed`,
      kind: "campaignExecuted",
      isRex: false,
      campaignUuid: campaign.uuid,
      label: "Executed set",
      groupKey,
      groupLabel: campaign.name,
    });
  }

  return columns;
};

/** Chunk consecutive columns sharing a header group. */
export const groupCoverageColumns = (columns: EvaReportColumn[]): StmCoverageColumnGroup[] => {
  const groups: StmCoverageColumnGroup[] = [];
  for (const column of columns) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.groupKey === column.groupKey) lastGroup.columns.push(column);
    else
      groups.push({
        groupKey: column.groupKey,
        groupLabel: column.groupLabel,
        columns: [column],
      });
  }
  return groups;
};

/** Missing/null REX action status means pending. */
export const getActionRexStatus = (rex: Rex | undefined, actionUuid: string): RexStatus =>
  rex?.actionEntries?.[actionUuid]?.rexStatus ?? "pending";

const getEligibleActionsForEva = ({
  mission,
  evaUuid,
  rex,
  rexStatusFilter,
}: {
  mission: Mission;
  evaUuid: string;
  rex?: Rex;
  rexStatusFilter: RexStatusFilter;
}): Action[] => {
  const stationUuids = new Set(selectEvaStations(mission, evaUuid).map((station) => station.uuid));
  const traverseUuids = new Set(
    selectEvaTraverses(mission, evaUuid).map((traverse) => traverse.uuid)
  );
  return Object.values(mission.actions ?? {}).filter((action) => {
    if (!action.stmAction || !action.enabled) return false;
    const inEva =
      (!!action.stationUuid && stationUuids.has(action.stationUuid)) ||
      (!!action.traverseUuid && traverseUuids.has(action.traverseUuid));
    if (!inEva) return false;
    if (!rex || rexStatusFilter === "all") return true;
    const status = getActionRexStatus(rex, action.uuid);
    if (rexStatusFilter === "notSkipped") return status !== "skipped";
    return status === "complete";
  });
};

/** Return all rule-eligible actions represented by a report column. */
export const getEligibleActionsForColumn = ({
  mission,
  column,
  rexStatusFilter,
}: {
  mission: Mission;
  column: EvaReportColumn;
  rexStatusFilter: RexStatusFilter;
}): Action[] => {
  if (!column.campaignUuid && column.evaUuid) {
    return getEligibleActionsForEva({
      mission,
      evaUuid: column.evaUuid,
      rex: column.isRex ? mission.rexes?.[column.rexUuid ?? ""] : undefined,
      rexStatusFilter,
    });
  }

  const campaign = column.campaignUuid ? mission.reportCampaigns?.[column.campaignUuid] : undefined;
  if (!campaign) return [];

  if (column.kind === "campaignPlanned") {
    return campaign.memberEvaUuids.flatMap((evaUuid) =>
      mission.evas?.[evaUuid] ? getEligibleActionsForEva({ mission, evaUuid, rexStatusFilter }) : []
    );
  }

  if (column.kind === "campaignExecuted") {
    return resolveCampaignExecutionRexes(mission, campaign).flatMap((rex) =>
      mission.evas?.[rex.evaUuid]
        ? getEligibleActionsForEva({
            mission,
            evaUuid: rex.evaUuid,
            rex,
            rexStatusFilter,
          })
        : []
    );
  }

  return [];
};

/** Existing campaign members represented as expansion sub-columns. */
export const getCampaignMemberItems = (
  mission: Mission,
  column: EvaReportColumn
): StmCoverageSequenceItem[] => {
  if (!column.campaignUuid) return [];
  const campaign = mission.reportCampaigns?.[column.campaignUuid];
  if (!campaign) return [];
  if (column.kind === "campaignExecuted") {
    return campaign.memberEvaUuids.flatMap((evaUuid) => {
      const eva = mission.evas?.[evaUuid];
      const rex = resolveCampaignExecutionRexes(mission, {
        ...campaign,
        memberEvaUuids: [evaUuid],
      })[0];
      const asPlannedRexEva = rex
        ? getAsPlannedEvaFromRefUuid(mission, mission.evas?.[rex.evaUuid]?.refUuid ?? "")
        : undefined;
      return eva && rex && asPlannedRexEva
        ? [{ type: "eva" as const, uuid: eva.uuid, name: `REX: ${asPlannedRexEva.name}` }]
        : [];
    });
  }
  return campaign.memberEvaUuids.flatMap((evaUuid) => {
    const eva = mission.evas?.[evaUuid];
    return eva ? [{ type: "eva" as const, uuid: eva.uuid, name: eva.name }] : [];
  });
};

/**
 * Partition campaign coverage match occurrences by member EVA. An action can
 * legitimately appear in more than one member when EVAs reuse the same
 * station/traverse; distribute duplicate occurrences across those members so
 * member counts always sum exactly to the campaign total.
 */
export const groupCampaignMatchesByMember = ({
  mission,
  column,
  level3Coverage,
}: {
  mission: Mission;
  column: EvaReportColumn;
  level3Coverage: StmCoverageLevel3;
}): { [evaUuid: string]: number } => {
  const memberItems = getCampaignMemberItems(mission, column);
  const counts: { [evaUuid: string]: number } = Object.fromEntries(
    memberItems.map(({ uuid }) => [uuid, 0])
  );
  const occurrenceByActionUuid: { [actionUuid: string]: number } = {};

  for (const ruleCoverage of level3Coverage.rules) {
    for (const actionUuid of ruleCoverage.matchingActionUuids) {
      const action = mission.actions?.[actionUuid];
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
  }

  return counts;
};

/** Determine whether an action belongs to a campaign member's represented EVA/REX. */
export const actionBelongsToCampaignMember = ({
  mission,
  column,
  memberEvaUuid,
  action,
}: {
  mission: Mission;
  column: EvaReportColumn;
  memberEvaUuid: string;
  action: Action;
}): boolean => {
  let sourceEvaUuid = memberEvaUuid;
  if (column.kind === "campaignExecuted" && column.campaignUuid) {
    const campaign = mission.reportCampaigns?.[column.campaignUuid];
    if (!campaign) return false;
    const rex = resolveCampaignExecutionRexes(mission, {
      ...campaign,
      memberEvaUuids: [memberEvaUuid],
    })[0];
    if (!rex) return false;
    sourceEvaUuid = rex.evaUuid;
  }
  const stationUuids = new Set(selectEvaStations(mission, sourceEvaUuid).map(({ uuid }) => uuid));
  const traverseUuids = new Set(selectEvaTraverses(mission, sourceEvaUuid).map(({ uuid }) => uuid));
  return (
    (!!action.stationUuid && stationUuids.has(action.stationUuid)) ||
    (!!action.traverseUuid && traverseUuids.has(action.traverseUuid))
  );
};
