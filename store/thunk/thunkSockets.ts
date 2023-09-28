import appCreateAsyncThunk from "./thunkUtil";
import {
  deletePresetByUuid,
  deletePresetFromDbByUuid,
  setPresetEditMode,
  setSelectedPresetUuid,
  upsertPresets,
  upsertPresetsFromDb,
} from "store/preset";
import {
  deletePoiByUuid,
  deletePoiFromDbByUuid,
  setPoiEditMode,
  setSelectedPoiUuid,
  upsertPois,
  upsertPoisFromDb,
} from "store/poi";
import {
  deleteStationByUuid,
  deleteStationFromDbByUuid,
  setSelectedStationUuid,
  setStationEditMode,
  upsertStations,
  upsertStationsFromDb,
} from "store/station";
import {
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  setEvaEditMode,
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
  setTraverseEditMode,
  upsertTraverses,
  upsertTraversesFromDb,
} from "store/traverse";
import { setMission, setMissionFromDb, setMissionSectionEditing } from "store/mission";
import {
  deleteRexByUuid,
  deleteRexFromDbByUuid,
  setCrewPosEditingUuid,
  setRexesCrewPosEditMode,
  setRexEditMode,
  upsertRex,
  upsertRexFromDb,
  setSelectedRexUuid,
} from "store/rex";
import { updateMapDirective } from "store/map";

/**
 * Handles the storeUpsert socket event
 */
export const thunkSocketsHandleUpsert = appCreateAsyncThunk<
  {
    storeUpsert: StoreUpsert<POI | Preset | Station | Eva | Action | Traverse | Mission | Rex>;
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
        dispatch(setPresetEditMode({ presetUuid: changedPreset.uuid, editMode: false }));
      }
    }
    dispatch(upsertPresets(changedPresets, true));
    dispatch(upsertPresetsFromDb(changedPresets));
  } else if (storeUpsert.type === "poi") {
    const changedPois = storeUpsert.data as POI[];
    for (const changedPoi of changedPois) {
      if (getState().poi.poisEditing.includes(changedPoi.uuid)) {
        upsertMessages.push(getConflictMessage("POI", changedPoi.name, "upsert"));
        dispatch(setPoiEditMode({ poiUuid: changedPoi.uuid, editMode: false }));
        //if there was an open map directive for this poi, cancel it.
        if (getState().map.mapDirective?.uuid === changedPoi.uuid) {
          dispatch(
            updateMapDirective({
              mapItemType: "poi",
              uuid: changedPoi.uuid,
              mapAction: "cancelEditMarker",
            })
          );
        }
      }
    }
    dispatch(upsertPois(changedPois, true));
    dispatch(upsertPoisFromDb(changedPois));
  } else if (storeUpsert.type === "station") {
    const changedStations = storeUpsert.data as Station[];
    for (const changedStation of changedStations) {
      if (getState().station.stationsEditing.includes(changedStation.uuid)) {
        upsertMessages.push(getConflictMessage("Station", changedStation.name, "upsert"));
        dispatch(setStationEditMode({ stationUuid: changedStation.uuid, editMode: false }));
        //if there was an open map directive for this station, cancel it.
        if (getState().map.mapDirective?.uuid === changedStation.uuid) {
          dispatch(
            updateMapDirective({
              mapItemType: "station",
              uuid: changedStation.uuid,
              mapAction: "cancelEditMarker",
            })
          );
        }
      }
    }
    dispatch(upsertStations(changedStations, true));
    dispatch(upsertStationsFromDb(changedStations));
  } else if (storeUpsert.type === "eva") {
    const changedEvas = storeUpsert.data as Eva[];
    for (const changedEva of changedEvas) {
      if (getState().eva.evasEditing.includes(changedEva.uuid)) {
        upsertMessages.push(getConflictMessage("EVA", changedEva.name, "upsert"));
        dispatch(setEvaEditMode({ evaUuid: changedEva.uuid, editMode: false }));
      }
      // if the eva being upserted is the selected eva, then nullify the selectedSequenceItemUuid
      if (getState().eva.selectedEvaUuid === changedEva.uuid) {
        dispatch(setSelectedEvaSequenceItemUuid(null));
      }
    }
    dispatch(upsertEvas(changedEvas, true));
    dispatch(upsertEvasFromDb(changedEvas));
  } else if (storeUpsert.type === "action") {
    const changedActions = storeUpsert.data as Action[];
    for (const changedAction of changedActions) {
      //if there was an open map directive for this action, cancel it.
      if (getState().map.mapDirective?.uuid === changedAction.uuid) {
        dispatch(
          updateMapDirective({
            mapItemType: "action",
            uuid: changedAction.uuid,
            mapAction: "cancelEditMarker",
          })
        );
      }
    }
    dispatch(upsertActions(changedActions, true));
    dispatch(upsertActionsFromDb(changedActions));
  } else if (storeUpsert.type === "traverse") {
    const changedTraverses = storeUpsert.data as Traverse[];
    for (const changedTraverse of changedTraverses) {
      if (getState().traverse.traversesEditing.includes(changedTraverse.uuid)) {
        upsertMessages.push(getConflictMessage("traverse", changedTraverse.name, "upsert"));
        dispatch(setTraverseEditMode({ uuid: changedTraverse.uuid, editMode: false }));
      }
    }
    dispatch(upsertTraverses(storeUpsert.data as Traverse[], true));
    dispatch(upsertTraversesFromDb(storeUpsert.data as Traverse[]));
  } else if (storeUpsert.type === "mission") {
    if (getState().mission.missionSectionsEditing.length > 0) {
      upsertMessages.push("The mission that you are editing has been changed by another user.");
      dispatch(setMissionSectionEditing({ section: "prefs", editMode: false }));
    }
    dispatch(setMission(storeUpsert.data[0] as Mission));
    dispatch(setMissionFromDb(storeUpsert.data[0] as Mission));
  } else if (storeUpsert.type === "rex") {
    const changedRexs = storeUpsert.data as Rex[];
    for (const changedRex of changedRexs) {
      //check changes on rex object
      if (getState().rex.rexesEditing.includes(changedRex.uuid)) {
        upsertMessages.push(getConflictMessage("rex", changedRex.name, "upsert"));
        dispatch(setRexEditMode({ rexUuid: changedRex.uuid, editMode: false }));
      }
      //check changes on crew pos inside rex object. this is handled seperately
      if (getState().rex.rexesCrewPosEditing.includes(changedRex.uuid)) {
        upsertMessages.push(getConflictMessage("crew position on", changedRex.name, "upsert"));
        //if there was an open map directive for one of the crew pos, cancel it
        if (getState().map.mapDirective?.mapItemType === "crewPos") {
          dispatch(
            updateMapDirective({
              mapItemType: "crewPos",
              uuid: getState().rex.crewPosEditingUuid,
              mapAction: "cancelEditMarker",
            })
          );
        }
        dispatch(setRexesCrewPosEditMode({ rexUuid: changedRex.uuid, editMode: false }));
        dispatch(setCrewPosEditingUuid(null));
      }
      //if this rex is the new running rex, update selected rex
      if (changedRex.rexRunning) {
        dispatch(setSelectedRexUuid(changedRex.uuid));
      }
      dispatch(upsertRex(changedRex, true));
      dispatch(upsertRexFromDb(changedRex, true));
    }
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
      dispatch(setPresetEditMode({ presetUuid: deletedPreset.uuid, editMode: false }));
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
      dispatch(setPoiEditMode({ poiUuid: poiDeleted.uuid, editMode: false }));
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
      dispatch(setStationEditMode({ stationUuid: stationDeleted.uuid, editMode: false }));
    }
    if (getState().station.selectedStationUuid === storeDelete.uuid)
      dispatch(setSelectedStationUuid(null));
    dispatch(deleteStationByUuid(storeDelete.uuid));
    dispatch(deleteStationFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "eva") {
    if (getState().eva.evasEditing.includes(storeDelete.uuid)) {
      const evaDeleted = getState().eva.evas.find((eva) => eva.uuid === storeDelete.uuid);
      deletedMessages.push(getConflictMessage("EVA", evaDeleted.name, "delete"));
      dispatch(setEvaEditMode({ evaUuid: evaDeleted.uuid, editMode: false }));
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
      dispatch(setTraverseEditMode({ uuid: traverseDeleted.uuid, editMode: false }));
    }
    dispatch(deleteTraverseByUuid(storeDelete.uuid));
    dispatch(deleteTraverseFromDbByUuid(storeDelete.uuid));
  } else if (storeDelete.type === "rex") {
    if (getState().rex.rexesEditing.includes(storeDelete.uuid)) {
      const rexDeleted = getState().rex.rexes.find((rex) => rex.uuid === storeDelete.uuid);
      deletedMessages.push(getConflictMessage("rex", rexDeleted.name, "delete"));
      dispatch(setRexEditMode({ rexUuid: rexDeleted.uuid, editMode: false }));
    }
    dispatch(deleteRexByUuid(storeDelete.uuid));
    dispatch(deleteRexFromDbByUuid(storeDelete.uuid));
  }
  return deletedMessages;
});

const getConflictMessage = (type: string, name: string, action: string): string => {
  const actionPastTense = action === "upsert" ? "changed" : "deleted";
  return `The ${type} ${name} that you were editing has been ${actionPastTense} by another user. Your unsaved changes have been discarded.`;
};
