import flatten from "lodash/flatten";
import type { RootState } from "store";

export const selectPoiActions =
  (poiUuid: string) =>
  (state: RootState): Action[] =>
    state.action.actions.filter((storeAction: Action) => storeAction.poiUuid === poiUuid);

export const selectStationActions =
  (stationUuid: string) =>
  (state: RootState): Action[] =>
    state.action.actions.filter((storeAction: Action) => storeAction.stationUuid === stationUuid);

export const selectMissionId = (state: RootState): number | false => {
  const mission = state.mission.mission;
  if (mission) {
    return mission.id;
  } else {
    return false;
  }
};

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
