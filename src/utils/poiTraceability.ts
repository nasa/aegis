import sortBy from "lodash/sortBy";
import { selectAsPlannedStations, selectEvaStations, selectEvaTraverses } from "store/selectors";
import { getAsPlannedEvas, resolveCampaignExecutionRexes } from "utils/evaReportColumns";

/**
 * Pure computation module for the "POI Traceability" report (Reports pane,
 * Workstream D).
 *
 * Everything here is a plain function over `(mission, scope)` — no React, no
 * Redux, no Automerge handles (same style as `stmEvaCoverage.ts`). Scope
 * resolution reuses the campaign helpers from `evaReportColumns.ts` so a
 * campaign's planned/executed set means exactly the same EVAs it does in the
 * coverage and comparison grids.
 *
 * Types (PoiTraceScope, PoiTraceRow, ...) are declared ambiently in
 * `typings/poiTraceability.d.ts`.
 *
 * Note on the *executed* scope: linkage is always evaluated against as-planned
 * stations (`selectAsPlannedStations`), but the executed scope's in-scope EVAs
 * are REX EVAs, whose sequences hold REX station copies — not the as-planned
 * stations. So in executed scope `linkedStationCount` is 0 by construction;
 * execution tracking there comes through the promoted action copies (whose
 * `parentActionUuid` is preserved through REX duplication). This matches the
 * doc's "invert selectEvaStations over the in-scope EVA set" definition.
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

/** The execution REXes for a scope (only the executed campaign set has any). */
export const resolveScopeExecutionRexes = (mission: Mission, scope: PoiTraceScope): Rex[] => {
  if (scope.type !== "campaignExecuted") return [];
  const campaign = mission.reportCampaigns?.[scope.campaignUuid];
  if (!campaign) return [];
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
      for (const copy of copiesByParent.get(poiActionUuid) ?? []) {
        const inScopeEvaUuids = evasContainingAction(copy);
        if (inScopeEvaUuids.length === 0) continue; // copy is out of scope

        const station = copy.stationUuid ? mission.stations?.[copy.stationUuid] : null;
        const traverse = copy.traverseUuid ? mission.traverses?.[copy.traverseUuid] : null;

        const executions = rexInfos
          .filter(
            (info) =>
              (!!copy.stationUuid && info.stationUuids.has(copy.stationUuid)) ||
              (!!copy.traverseUuid && info.traverseUuids.has(copy.traverseUuid))
          )
          .map((info) => ({
            rexUuid: info.rex.uuid,
            rexName: info.rex.name,
            status: toTraceStatus(info.rex.actionEntries?.[copy.uuid]?.rexStatus),
          }));

        for (const execution of executions) {
          if (execution.status === "complete") completeCount += 1;
          else if (execution.status === "skipped") skippedCount += 1;
        }

        stationCopies.push({
          stationActionUuid: copy.uuid,
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
