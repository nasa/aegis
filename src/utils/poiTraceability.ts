import sortBy from "lodash/sortBy";
import { selectAsPlannedStations, selectEvaStations, selectEvaTraverses } from "store/selectors";
import {
  getAsPlannedEvas,
  getExecutionRexesForEva,
  resolveCampaignExecutionRexes,
} from "utils/evaReportColumns";

/**
 * POI action lineage. Plans include their REX history; executed campaign scopes
 * use the campaign's selected snapshots. Adoption follows parentActionUuid,
 * while action/location refUuids link each planned child to its REX copies.
 */

/** Collapse a REX action status (or a missing entry) to the report's tri-state. */
const toTraceStatus = (rexStatus: RexStatus | null | undefined): PoiTraceActionStatus =>
  rexStatus === "complete" ? "complete" : rexStatus === "skipped" ? "skipped" : "pending";

/** The in-scope EVA uuids for a scope (as-planned EVAs, or a campaign's set). */
export const resolveScopeEvaUuids = (mission: Mission, scope: PoiTraceScope): string[] => {
  if (scope.type === "all") {
    return getAsPlannedEvas(mission).map((eva) => eva.uuid);
  }
  const campaign = mission.reportCampaigns?.[scope.campaignUuid];
  if (!campaign) return [];
  if (scope.type === "campaignPlanned") {
    return campaign.memberEvaUuids.filter((evaUuid) => !!mission.evas?.[evaUuid]);
  }
  // campaignExecuted: the REX EVAs of the resolved execution rexes
  return resolveCampaignExecutionRexes(mission, campaign)
    .map((rex) => rex.evaUuid)
    .filter((evaUuid) => !!mission.evas?.[evaUuid]);
};

/** Plans include their execution history; executed campaigns use their selected REXes. */
export const resolveScopeExecutionRexes = (mission: Mission, scope: PoiTraceScope): Rex[] => {
  if (scope.type === "all") {
    return Object.values(mission.rexes ?? {}).filter((rex) => !!mission.evas?.[rex.evaUuid]);
  }
  const campaign = mission.reportCampaigns?.[scope.campaignUuid];
  if (!campaign) return [];
  if (scope.type === "campaignPlanned") {
    return [
      ...new Map(
        campaign.memberEvaUuids
          .flatMap((uuid) => getExecutionRexesForEva(mission, uuid))
          .map((rex) => [rex.uuid, rex])
      ).values(),
    ];
  }
  return resolveCampaignExecutionRexes(mission, campaign);
};

/**
 * Per-POI traceability rollups + lineage detail for the selected scope. Returns
 * every POI (filtering by tag/name is a UI concern), sorted by
 * `priorityOverride` then case-insensitive name.
 */
export const computePoiTraceability = ({
  mission,
  scope,
}: {
  mission: Mission;
  scope: PoiTraceScope;
}): PoiTraceRow[] => {
  const scopeEvaUuids = resolveScopeEvaUuids(mission, scope);
  const executionRexes = resolveScopeExecutionRexes(mission, scope);

  // Station/traverse membership per in-scope EVA (invert selectEvaStations).
  const evaStationSets = new Map<string, Set<string>>();
  const evaTraverseSets = new Map<string, Set<string>>();
  for (const evaUuid of scopeEvaUuids) {
    evaStationSets.set(evaUuid, new Set(selectEvaStations(mission, evaUuid).map((s) => s.uuid)));
    evaTraverseSets.set(evaUuid, new Set(selectEvaTraverses(mission, evaUuid).map((t) => t.uuid)));
  }

  const evasContainingStation = (stationUuid: string): string[] =>
    scopeEvaUuids.filter((evaUuid) => evaStationSets.get(evaUuid)?.has(stationUuid));

  const evasContainingAction = (action: Action): string[] => {
    if (action.stationUuid) return evasContainingStation(action.stationUuid);
    if (action.traverseUuid) {
      return scopeEvaUuids.filter((evaUuid) =>
        evaTraverseSets.get(evaUuid)?.has(action.traverseUuid ?? "")
      );
    }
    return [];
  };

  // Station/traverse membership per execution REX's EVA, for status lookup.
  const rexInfos = executionRexes.map((rex) => ({
    rex,
    stationUuids: new Set(selectEvaStations(mission, rex.evaUuid).map((s) => s.uuid)),
    traverseUuids: new Set(selectEvaTraverses(mission, rex.evaUuid).map((t) => t.uuid)),
  }));

  const belongsToRex = (action: Action, info: (typeof rexInfos)[number]) =>
    (!!action.stationUuid && info.stationUuids.has(action.stationUuid)) ||
    (!!action.traverseUuid && info.traverseUuids.has(action.traverseUuid));

  // REX duplication preserves action and location refUuids. A shared POI parent
  // alone is insufficient: it can have several independently adopted children.
  const sameAdoption = (planned: Action, executed: Action) => {
    if (!planned.refUuid || planned.refUuid !== executed.refUuid) return false;
    if (planned.stationUuid && executed.stationUuid) {
      const ref = mission.stations?.[planned.stationUuid]?.refUuid;
      return !!ref && ref === mission.stations?.[executed.stationUuid]?.refUuid;
    }
    if (planned.traverseUuid && executed.traverseUuid) {
      const ref = mission.traverses?.[planned.traverseUuid]?.refUuid;
      return !!ref && ref === mission.traverses?.[executed.traverseUuid]?.refUuid;
    }
    return false;
  };

  const sameEvaFamily = (evaUuid: string, rex: Rex) => {
    const ref = mission.evas?.[evaUuid]?.refUuid;
    return !!ref && ref === mission.evas?.[rex.evaUuid]?.refUuid;
  };

  // Group every action copy by the POI action it was promoted from. Actions
  // with a null parent (authored directly on a station) are never attributed.
  const copiesByParent = new Map<string, Action[]>();
  for (const action of Object.values(mission.actions ?? {})) {
    const parent = action.parentActionUuid;
    if (!parent) continue;
    const existing = copiesByParent.get(parent);
    if (existing) existing.push(action);
    else copiesByParent.set(parent, [action]);
  }

  const asPlannedStations = selectAsPlannedStations(mission);

  const rows: PoiTraceRow[] = [];
  for (const poi of Object.values(mission.pois ?? {})) {
    // Linkage: every as-planned station linked via poiUuids, annotated with the
    // in-scope EVAs that contain it. linkedStationCount only counts stations
    // that appear in >=1 in-scope EVA.
    const linkedStations = asPlannedStations
      .filter((station) => station.poiUuids?.includes(poi.uuid))
      .map((station) => ({
        stationUuid: station.uuid,
        stationName: station.name,
        stationIcon: station.icon ?? null,
        inScopeEvaUuids: evasContainingStation(station.uuid),
      }));
    const linkedStationCount = linkedStations.filter(
      (linked) => linked.inScopeEvaUuids.length > 0
    ).length;

    const plannedEvaSet = new Set<string>();
    for (const linked of linkedStations) {
      for (const evaUuid of linked.inScopeEvaUuids) plannedEvaSet.add(evaUuid);
    }

    // Action promotion + execution.
    const poiActionUuids = poi.actionOrderUuids ?? [];
    const actions: PoiTraceActionDetail[] = [];
    let promotedActionCount = 0;
    let completeCount = 0;
    let skippedCount = 0;

    for (const poiActionUuid of poiActionUuids) {
      const poiAction = mission.actions?.[poiActionUuid];
      if (!poiAction) continue; // dangling entry in actionOrderUuids (deleted POI action)

      const stationCopies: PoiTraceStationCopy[] = [];
      const copies = copiesByParent.get(poiActionUuid) ?? [];
      const scopedCopies = copies.filter((copy) => evasContainingAction(copy).length > 0);
      for (const copy of copies) {
        let inScopeEvaUuids = evasContainingAction(copy);
        const directRexes = rexInfos.filter((info) => belongsToRex(copy, info));
        const executionOnly = inScopeEvaUuids.length === 0;
        if (executionOnly) {
          // Preserve historical adoptions even after the planned action/station
          // was removed. Do not repeat snapshots already attached to a plan.
          if (
            !directRexes.length ||
            scopedCopies.some(
              (planned) =>
                sameAdoption(planned, copy) &&
                evasContainingAction(planned).some((evaUuid) =>
                  directRexes.some(({ rex }) => sameEvaFamily(evaUuid, rex))
                )
            )
          )
            continue;
          inScopeEvaUuids = [...new Set(directRexes.map(({ rex }) => rex.evaUuid))];
        }

        const station = copy.stationUuid ? mission.stations?.[copy.stationUuid] : null;
        const traverse = copy.traverseUuid ? mission.traverses?.[copy.traverseUuid] : null;

        const executions: PoiTraceStationCopy["executions"] = inScopeEvaUuids.flatMap((evaUuid) =>
          rexInfos
            .filter(({ rex }) =>
              executionOnly || scope.type === "campaignExecuted"
                ? rex.evaUuid === evaUuid
                : sameEvaFamily(evaUuid, rex)
            )
            .map((info) => {
              const executed = belongsToRex(copy, info)
                ? copy
                : copies.find(
                    (candidate) => belongsToRex(candidate, info) && sameAdoption(copy, candidate)
                  );
              return {
                rexUuid: info.rex.uuid,
                rexName: info.rex.name,
                evaUuid,
                actionUuid: executed?.uuid ?? null,
                status: executed
                  ? toTraceStatus(info.rex.actionEntries?.[executed.uuid]?.rexStatus)
                  : "notIncluded",
              };
            })
        );

        for (const execution of executions) {
          if (execution.status === "complete") completeCount += 1;
          else if (execution.status === "skipped") skippedCount += 1;
        }

        stationCopies.push({
          stationActionUuid: copy.uuid,
          actionName: copy.name,
          enabled: copy.enabled,
          executionOnly,
          stationUuid: copy.stationUuid ?? null,
          stationName: station?.name ?? null,
          stationIcon: station?.icon ?? null,
          traverseUuid: copy.traverseUuid ?? null,
          traverseName: traverse?.name ?? null,
          parentCopyDate: copy.parentCopyDate ?? null,
          inScopeEvaUuids,
          executions,
        });

        for (const evaUuid of inScopeEvaUuids) plannedEvaSet.add(evaUuid);
      }

      if (stationCopies.length > 0) promotedActionCount += 1;
      actions.push({ poiActionUuid, name: poiAction.name, stationCopies });
    }

    rows.push({
      poiUuid: poi.uuid,
      name: poi.name,
      tags: poi.tags ?? [],
      priorityOverride: poi.priorityOverride ?? null,
      linkedStationCount,
      promotedActionCount,
      totalPoiActionCount: poiActionUuids.length,
      plannedEvaCount: plannedEvaSet.size,
      completeCount,
      skippedCount,
      actions,
      linkedStations,
    });
  }

  return sortBy(rows, [
    (row) => row.priorityOverride ?? Number.POSITIVE_INFINITY,
    (row) => row.name.toLowerCase(),
  ]);
};
