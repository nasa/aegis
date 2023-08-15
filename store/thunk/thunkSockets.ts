import appCreateAsyncThunk from "./thunkUtil";
import {
  deletePresetByUuid,
  deletePresetFromDbByUuid,
  setSelectedPresetUuid,
  upsertPresets,
  upsertPresetsFromDb,
} from "store/preset";
import {
  deletePoiByUuid,
  deletePoiFromDbByUuid,
  setSelectedPoiUuid,
  upsertPois,
  upsertPoisFromDb,
} from "store/poi";
import {
  deleteStationByUuid,
  deleteStationFromDbByUuid,
  setSelectedStationUuid,
  upsertStations,
  upsertStationsFromDb,
} from "store/station";
import {
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaUuid,
  upsertEvas,
  upsertEvasFromDb,
} from "store/eva";
import {
  deleteActionByUuid,
  deleteActionFromDbByUuid,
  upsertActions,
  upsertActionsFromDb,
} from "store/action";
import {
  deleteTraverseByUuid,
  deleteTraverseFromDbByUuid,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { setMission, setMissionFromDb } from "store/mission";

/**
 * Handles the storeUpsert socket event
 */
export const thunkSocketsHandleUpsert = appCreateAsyncThunk<
  {
    storeUpsert: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission>;
  },
  string[],
  false
>("thunkSocketsHandleUpsert", async ({ storeUpsert }, { dispatch, getState }) => {
  const upsertMessages: string[] = [];

  if (storeUpsert.type === "preset") {
    const changedPresets = storeUpsert.data as Preset[];
    for (const changedPreset of changedPresets) {
      if (getState().preset.presetsEditing.includes(changedPreset.uuid)) {
        upsertMessages.push(getConflictMessage("preset", changedPreset.name, "upsert"));
      }
    }
    dispatch(upsertPresets(storeUpsert.data as Preset[], true));
    dispatch(upsertPresetsFromDb(storeUpsert.data as Preset[]));
  } else if (storeUpsert.type === "poi") {
    const changedPois = storeUpsert.data as POI[];
    for (const changedPoi of changedPois) {
      if (getState().poi.poisEditing.includes(changedPoi.uuid)) {
        upsertMessages.push(getConflictMessage("POI", changedPoi.name, "upsert"));
      }
    }
    dispatch(upsertPois(storeUpsert.data as POI[], true));
    dispatch(upsertPoisFromDb(storeUpsert.data as POI[]));
  } else if (storeUpsert.type === "station") {
    const changedStations = storeUpsert.data as Station[];
    for (const changedStation of changedStations) {
      if (getState().station.stationsEditing.includes(changedStation.uuid)) {
        upsertMessages.push(getConflictMessage("Station", changedStation.name, "upsert"));
      }
    }
    dispatch(upsertStations(storeUpsert.data as Station[], true));
    dispatch(upsertStationsFromDb(storeUpsert.data as Station[]));
  } else if (storeUpsert.type === "eva") {
    const changedEvas = storeUpsert.data as Eva[];
    for (const changedEva of changedEvas) {
      if (getState().eva.evasEditing.includes(changedEva.uuid)) {
        upsertMessages.push(getConflictMessage("EVA", changedEva.name, "upsert"));
      }
      // if the eva being upserted is the selected eva, then nullify the selectedSequenceItemUuid
      if (getState().eva.selectedEvaUuid === changedEva.uuid) {
        dispatch(setSelectedEvaSequenceItemUuid(null));
      }
    }
    dispatch(upsertEvas(storeUpsert.data as Eva[], true));
    dispatch(upsertEvasFromDb(storeUpsert.data as Eva[]));
  } else if (storeUpsert.type === "action") {
    dispatch(upsertActions(storeUpsert.data as Action[], true));
    dispatch(upsertActionsFromDb(storeUpsert.data as Action[]));
  } else if (storeUpsert.type === "traverse") {
    const changedTraverses = storeUpsert.data as Traverse[];
    for (const changedTraverse of changedTraverses) {
      if (getState().traverse.traversesEditing.includes(changedTraverse.uuid)) {
        upsertMessages.push(getConflictMessage("traverse", changedTraverse.name, "upsert"));
      }
    }
    dispatch(upsertTraverses(storeUpsert.data as Traverse[], true));
    dispatch(upsertTraversesFromDb(storeUpsert.data as Traverse[]));
  } else if (storeUpsert.type === "mission") {
    if (getState().mission.missionSectionsEditing.length > 0) {
      upsertMessages.push(
        "The mission that you are editing has been changed by another user. Your changes have been discarded."
      );
    }
    dispatch(setMission(storeUpsert.data[0] as Mission));
    dispatch(setMissionFromDb(storeUpsert.data[0] as Mission));
  }
  return upsertMessages;
});

/**
 * Handles the storeDelete socket event
 */
export const thunkSocketsHandleDelete = appCreateAsyncThunk<
  {
    storeDelete: StoreDelete;
  },
  string[],
  false
>("thunkSocketsHandleDelete", async ({ storeDelete }, { dispatch, getState }) => {
  const deletedMessages: string[] = [];

  if (storeDelete.type === "preset") {
    if (getState().preset.presetsEditing.includes(storeDelete.uuid)) {
      const deletedPreset = getState().preset.presets.find(
        (preset) => preset.uuid === storeDelete.uuid
      );
      deletedMessages.push(getConflictMessage("preset", deletedPreset.name, "delete"));
    }
    if (getState().preset.selectedPresetUuid === storeDelete.uuid) {
      // set the selected preset to the default preset
      const defaultPreset = getState().preset.presets.find(
        (thisPreset) => thisPreset.missionPresetDefault === true
      ) as Preset;
      dispatch(setSelectedPresetUuid(defaultPreset.uuid));
    }
    dispatch(deletePresetByUuid(storeDelete.uuid));
    dispatch(deletePresetFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "poi") {
    if (getState().poi.poisEditing.includes(storeDelete.uuid)) {
      const poiDeleted = getState().poi.pois.find((poi) => poi.uuid === storeDelete.uuid);
      deletedMessages.push(getConflictMessage("POI", poiDeleted.name, "delete"));
    }
    if (getState().poi.selectedPoiUuid === storeDelete.uuid) dispatch(setSelectedPoiUuid(null));
    dispatch(deletePoiByUuid(storeDelete.uuid));
    dispatch(deletePoiFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "station") {
    if (getState().station.stationsEditing.includes(storeDelete.uuid)) {
      const stationDeleted = getState().station.stations.find(
        (station) => station.uuid === storeDelete.uuid
      );
      deletedMessages.push(getConflictMessage("station", stationDeleted.name, "delete"));
    }
    if (getState().station.selectedStationUuid === storeDelete.uuid)
      dispatch(setSelectedStationUuid(null));
    dispatch(deleteStationByUuid(storeDelete.uuid));
    dispatch(deleteStationFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "eva") {
    if (getState().eva.evasEditing.includes(storeDelete.uuid)) {
      const evaDeleted = getState().eva.evas.find((eva) => eva.uuid === storeDelete.uuid);
      deletedMessages.push(getConflictMessage("EVA", evaDeleted.name, "delete"));
    }
    if (getState().eva.selectedEvaUuid === storeDelete.uuid) {
      dispatch(setSelectedEvaUuid(null));
      dispatch(setSelectedEvaSequenceItemUuid(null));
    }
    dispatch(deleteEvaByUuid(storeDelete.uuid));
    dispatch(deleteEvaFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "action") {
    dispatch(deleteActionByUuid(storeDelete.uuid));
    dispatch(deleteActionFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "traverse") {
    if (getState().traverse.traversesEditing.includes(storeDelete.uuid)) {
      const traverseDeleted = getState().traverse.traverses.find(
        (traverse) => traverse.uuid === storeDelete.uuid
      );
      deletedMessages.push(getConflictMessage("traverse", traverseDeleted.name, "delete"));
    }
    dispatch(deleteTraverseByUuid(storeDelete.uuid));
    dispatch(deleteTraverseFromDbByUuid(storeDelete.uuid));
  }
  return deletedMessages;
});

const getConflictMessage = (type: string, name: string, action: string): string => {
  const actionPastTense = action === "upsert" ? "changed" : "deleted";
  return `The ${type} ${name} that you are editing has been ${actionPastTense} by another user.`;
};
