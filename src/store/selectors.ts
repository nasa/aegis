import sortBy from "lodash/sortBy";
import concat from "lodash/concat";
import flatten from "lodash/flatten";
import type { RootState } from "store";

/**
 * Gets all Stations for an EVA. If no EVA uuid is provided, use the selectedEvaUuid
 */
export const selectEvaStations =
  (evaUuid?: string) =>
  (state: RootState): Station[] => {
    const eva = state.eva.evas.find((e) => e.uuid === (evaUuid || state.eva.selectedEvaUuid));
    if (eva?.sequence) {
      return eva.sequence
        .filter((seqItem) => seqItem.type === "station")
        .map((stationSeqItem) => {
          return state.station.stations.find((s) => s.uuid === stationSeqItem.uuid);
        });
    }
  };

/**
 * Gets all Traverses for an EVA. If no EVA uuid is provided, use the selectedEvaUuid
 */
export const selecteEvaTraverses =
  (evaUuid?: string) =>
  (state: RootState): Traverse[] => {
    const eva = state.eva.evas.find((e) => e.uuid === (evaUuid || state.eva.selectedEvaUuid));
    if (eva?.sequence) {
      return eva.sequence
        .filter((seqItem) => seqItem.type === "traverse")
        .map((traverseSeqItem) => {
          return state.traverse.traverses.find((t) => t.uuid === traverseSeqItem.uuid);
        });
    }
  };

/**
 * Gets all Actions for an EVA. If no EVA uuid is provided, use the selectedEvaUuid
 */
export const selectEvaActions =
  (evaUuid?: string) =>
  (state: RootState): Action[] => {
    const eva = state.eva.evas.find((e) => e.uuid === (evaUuid || state.eva.selectedEvaUuid));
    if (eva?.sequence) {
      const actions: Action[][] = eva.sequence
        .filter((seqItem) => seqItem.type === "station")
        .map((stationSeqItem) => {
          return state.action.actions.filter((a) => a.stationUuid === stationSeqItem.uuid);
        });
      return flatten(actions);
    }
  };

/**
 * Gets all stations that are not in a REX EVA or ingress/egress locations and returns them sorted by name.
 * Since sequence stations and ingress/egress stations are not duplicated until the EVA is saved,
 *     only filter out using the fromDB copies in the store.
 */
export const selectAsPlannedStations = (state: RootState): Station[] => {
  // First get all the stations we want to filter out
  const allRexEvasUuids = state.rex.rexesFromDb.map((rex) => rex.evaUuid);
  // Get all stations that are in a REX's EVA.
  const allRexEvaStationUuids = state.eva.evasFromDb
    .filter((e) => allRexEvasUuids.includes(e.uuid))
    .flatMap((eva) => eva.sequence?.filter((seq) => seq.type === "station").map((seq) => seq.uuid));
  // Get all stations that are ingress/egress in REX's EVAs
  const allIngressEgressStationUuids = state.eva.evasFromDb
    .filter((e) => allRexEvasUuids.includes(e.uuid))
    .flatMap((eva) => {
      const xgressStationUuids = [];
      if (eva.ingressLocationUuid !== "lander") xgressStationUuids.push(eva.ingressLocationUuid);
      if (eva.egressLocationUuid !== "lander") xgressStationUuids.push(eva.egressLocationUuid);
      return xgressStationUuids;
    });
  // combine all uuids get stations that we need to filter out
  // use the regular store (not the fromDB copy) to include unsaved stations
  const allStationUuids = concat(allRexEvaStationUuids, allIngressEgressStationUuids);
  const stationList = state.station.stations.filter(
    (station) => !allStationUuids.includes(station.uuid)
  );
  return sortBy(stationList, (station) => station.name.toLowerCase());
};
