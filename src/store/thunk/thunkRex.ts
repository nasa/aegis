import appCreateAsyncThunk from "./thunkUtil";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import {
  deleteRexesByUuid,
  deleteRexesFromDbByUuid,
  upsertRexes,
  upsertRexesFromDb,
  setSelectedRexUuid,
  upsertRexByField,
  setSelectedPosEntryUuid,
} from "store/rex";
import cloneDeep from "lodash/cloneDeep";
import { makeExportRexes } from "utils/export";
import * as jsonKeysSort from "json-keys-sort";
import * as httpClient_Rex from "http-client/rex";
import { generateBlankRex } from "store/storeUtils/rex";
import { thunkCancelPosEntry } from "./thunkRexPosEntry";
import { thunkAddRemoveFolderItem } from "./thunkFolder";
import { thunkDeleteEva, thunkDuplicateEva, thunkSetOnlyShowRunningRexEva } from "./thunkEva";
import {
  setEvaDropdownUIState,
  setSelectedEvaUuid,
  setOnlyShowRunningRex,
  setSelectedEvaSequenceItemUuid,
} from "store/eva";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { setSectionSelected } from "store/interface";

/**
 * Creates a new rex via duplication and saves everything to DB. returns the newly created eva uuid
 */
export const thunkCreateRex = appCreateAsyncThunk<
  { asPlannedEvaUuid: string },
  string | null,
  false
>("rexCreate", async ({ asPlannedEvaUuid }, { dispatch, getState }) => {
  if (!asPlannedEvaUuid) throw new Error("Error creating Rex. No EVA uuid provided");

  // duplicate the EVA (this will save to the db)
  const dupEvaThunkRes = await dispatch(
    thunkDuplicateEva({ evaUuid: asPlannedEvaUuid, includeStations: true, forRex: true })
  );
  if (dupEvaThunkRes?.meta.requestStatus === "rejected" || !dupEvaThunkRes.payload) {
    throw new Error("Error creating Rexes. Cannot duplicate EVA ");
  }
  const duplicatedEva = dupEvaThunkRes.payload;

  // create Rex and add duplicated EVA to it
  const evaUuidsWithSameRefUuid = getState()
    .eva.evas.filter((e) => e.refUuid === duplicatedEva.refUuid)
    .map((e) => e.uuid);
  const rexNames = getState()
    .rex.rexes.filter((r) => evaUuidsWithSameRefUuid.includes(r.evaUuid))
    .map((r) => r.name);
  const randomName = makeUniqueStringCopy("New REX", rexNames, false);
  const blankRex = generateBlankRex({
    missionId: getState().mission.mission.id,
    name: randomName,
    evaUuid: duplicatedEva.uuid,
  });

  // save rex to db
  const upsertRexResponse = await httpClient_Rex.upsertRexes([blankRex]);
  if (upsertRexResponse.status !== "success") {
    throw new Error("Error upserting Rexes: " + upsertRexResponse.message);
  }
  dispatch(upsertRexes([blankRex]));
  dispatch(upsertRexesFromDb([blankRex]));

  // set selections
  dispatch(setSelectedRexUuid(blankRex.uuid));
  dispatch(setSelectedEvaUuid(duplicatedEva.uuid));
  dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  dispatch(setEvaDropdownUIState({ asPlannedEvaUuid, dropdownEvaUuid: duplicatedEva.uuid }));
  return duplicatedEva.uuid;
});

export const thunkSaveRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexSave",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;
    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

    const rexToSave: Rex = cloneDeep(rex);
    // check if pos entry is mid-edit
    if (getState().rex.posEntryEditingUuid) {
      const positionEntryInEdit = rex.posEntries.find(
        (c) => c.uuid === getState().rex.posEntryEditingUuid
      );
      if (positionEntryInEdit) {
        await dispatch(thunkCancelPosEntry({ posEntryUuid: positionEntryInEdit.uuid }));
        // the record will be removed via reducer but it may not hit the store before we upsert. Manually change it here
        const newAllPosEntries = rex.posEntries.filter((c) => c.uuid !== positionEntryInEdit.uuid);
        rexToSave.posEntries = newAllPosEntries;
      }
    }
    // if we are stopping execution and had "only show running rex" enabled, disable it so everything re-appears
    const rexFromDb = getState().rex.rexesFromDb.find((r) => r.uuid === rexUuid);
    if (rexFromDb.isRunning && !rex.isRunning && getState().eva.showRunningRexOnly) {
      dispatch(setOnlyShowRunningRex(false));
    }

    const upsertResponse = await httpClient_Rex.upsertRexes([rexToSave]);
    if (upsertResponse.status !== "success") {
      throw new Error("Error upserting Rexes: " + upsertResponse.message);
    }
    // upsert the changed rex to the store
    dispatch(upsertRexes([upsertResponse.data[0]], true));
    // update the rex in the store from the DB
    dispatch(upsertRexesFromDb([upsertResponse.data[0]]));
  }
);

export const thunkCancelRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexCancel",
  async ({ rexUuid }, { dispatch, getState }) => {
    const rexFromDb = getState().rex.rexesFromDb.find((rexDb) => rexDb.uuid === rexUuid);
    const rexEvaUuid = getState().rex.rexes.find((rex) => rex.uuid === rexUuid)?.evaUuid;

    // if selected rex isn't in the db, delete it from the store
    if (!rexFromDb) {
      // first delete the rex's EVA from the store
      await dispatch(thunkDeleteEva({ evaUuid: rexEvaUuid, forRex: true }));

      // now delete the rex
      dispatch(deleteRexesByUuid([rexUuid]));
      dispatch(setSelectedRexUuid(null)); // reset since the rex was deleted
      dispatch(
        thunkAddRemoveFolderItem({
          itemUuid: rexUuid,
          folderUuid: null,
        })
      );
    } else {
      // if selected rex is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertRexes([rexFromDb], true));
    }
  }
);

export const thunkDeleteRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDelete",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;
    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
    if (rex.isRunning && getState().eva.showRunningRexOnly) {
      dispatch(setOnlyShowRunningRex());
    }

    // delete from dropdown UI state
    const allRexEvasUuids = getState().rex.rexes.map((rex) => rex.evaUuid);
    const eva = getState().eva.evas.find((e) => e.uuid === rex.evaUuid);
    const asPlannedEvaUuid = getState().eva.evas.find(
      (e) => e.refUuid === eva.refUuid && !allRexEvasUuids.includes(e.uuid)
    )?.uuid;
    dispatch(
      setEvaDropdownUIState({
        asPlannedEvaUuid: asPlannedEvaUuid,
        dropdownEvaUuid: null,
      })
    );
    // clear other selections
    dispatch(setSelectedEvaUuid(asPlannedEvaUuid));
    dispatch(setSelectedPosEntryUuid(null));
    dispatch(setSelectedRexUuid(null));

    // delete the eva
    await dispatch(thunkDeleteEva({ evaUuid: rex.evaUuid, forRex: true }));

    // delete from DB

    const deleteResponse = await httpClient_Rex.deleteRexes([rexUuid]);
    if (deleteResponse.status !== "success") {
      throw new Error("Error deleting Rex: " + deleteResponse.message);
    }

    // delete the rex from the store
    dispatch(deleteRexesByUuid([rexUuid]));
    dispatch(deleteRexesFromDbByUuid([rexUuid]));
  }
);

export const thunkRexPetStartStop = appCreateAsyncThunk<{
  rexUuid: string;
  directive: "start" | "stop";
  petValue: string;
}>("rexPetTimerStartStop", async ({ rexUuid, directive, petValue }, { getState, dispatch }) => {
  const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

  dispatch(
    upsertRexes([
      {
        ...rex,
        petRunning: directive === "start",
        petValueAtStartStop: petValue,
        petStartStopTimestamp: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ])
  );
});

export const thunkAddRexStatusEntry = appCreateAsyncThunk<{
  entryType: "station" | "traverse" | "action" | "xgress";
  uuid: string; //uuid of the station, traverse, or action to add a status to
  rexStatus: RexStatus;
}>("addRexStatusEntry", async ({ entryType, uuid, rexStatus }, { dispatch, getState }) => {
  const runningRexFromDb = cloneDeep(getState().rex.rexesFromDb.find((rex) => rex.isRunning));
  if (!runningRexFromDb) return;

  const runningRex = getState().rex.rexes.find((r) => r.isRunning);
  if (!runningRex) return null;
  //modify the rex object based on the entry type. upsert to both copies in the store
  if (entryType === "station") {
    const newEntry: StationEntry = {
      rexStatus,
    };
    const newEntries = cloneDeep(runningRexFromDb.stationEntries) || {};
    newEntries[uuid] = newEntry;
    runningRexFromDb.stationEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "stationEntries", newEntries, true));
    dispatch(upsertRexesFromDb([runningRexFromDb]));
  } else if (entryType === "traverse") {
    const newEntry: TraverseEntry = {
      rexStatus,
    };
    const newEntries = cloneDeep(runningRexFromDb.traverseEntries) || {};
    newEntries[uuid] = newEntry;
    runningRexFromDb.traverseEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "traverseEntries", newEntries, true));
    dispatch(upsertRexesFromDb([runningRexFromDb]));
  } else if (entryType === "action") {
    const newEntries = cloneDeep(runningRexFromDb.actionEntries) || {};
    if (newEntries[uuid]) {
      newEntries[uuid] = {
        ...newEntries[uuid],
        rexStatus,
      };
    } else {
      newEntries[uuid] = {
        rexStatus,
        mass: null,
        markerId: null,
        containerId: null,
        secondaryContainerId: null,
      };
    }
    runningRexFromDb.actionEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "actionEntries", newEntries, true));
    dispatch(upsertRexesFromDb([runningRexFromDb]));
  } else if (entryType === "xgress") {
    const newEntry: XgressEntry = {
      rexStatus,
    };
    const newEntries = cloneDeep(runningRexFromDb.xgressEntries) || {};
    newEntries[uuid] = newEntry;
    runningRexFromDb.xgressEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "xgressEntries", newEntries, true));
    dispatch(upsertRexesFromDb([runningRexFromDb]));
  }

  // update the rex in the database
  const upsertRexRes = await httpClient_Rex.upsertRexes([runningRexFromDb]);
  if (upsertRexRes.status !== "success") {
    throw new Error("Error upserting Rexes for status entry: " + upsertRexRes.message);
  }
});

export const thunkAddRexActionMass = appCreateAsyncThunk<{
  uuid: string;
  mass: number;
}>("addRexActionMass", async ({ uuid, mass }, { dispatch, getState }) => {
  const runningRexFromDb = cloneDeep(getState().rex.rexesFromDb.find((rex) => rex.isRunning));
  if (!runningRexFromDb) return;

  const newEntries = cloneDeep(runningRexFromDb.actionEntries) || {};
  if (newEntries[uuid]) {
    newEntries[uuid] = {
      ...newEntries[uuid],
      mass,
    }; // update the mass of the entry
  } else {
    newEntries[uuid] = {
      rexStatus: null,
      mass,
      markerId: null,
      containerId: null,
      secondaryContainerId: null,
    };
  }
  runningRexFromDb.actionEntries = newEntries;
  dispatch(upsertRexByField(runningRexFromDb.uuid, "actionEntries", newEntries, true));
  dispatch(upsertRexesFromDb([runningRexFromDb]));

  // update the rex in the database
  const upsertRexRes = await httpClient_Rex.upsertRexes([runningRexFromDb]);
  if (upsertRexRes.status !== "success") {
    throw new Error("Error upserting Rexes for action mass: " + upsertRexRes.message);
  }
});

export const thunkAddCollectionId = appCreateAsyncThunk<{
  uuid: string;
  id: string;
  collectionType: "marker" | "container" | "secondaryContainer";
}>("addRexCollectionId", async ({ uuid, id, collectionType }, { dispatch, getState }) => {
  const runningRexFromDb = cloneDeep(getState().rex.rexesFromDb.find((rex) => rex.isRunning));
  if (!runningRexFromDb) return;

  const newEntries = cloneDeep(runningRexFromDb.actionEntries) || {};
  if (newEntries[uuid]) {
    newEntries[uuid] = {
      ...newEntries[uuid],
      markerId: collectionType === "marker" ? id : newEntries[uuid].markerId,
      containerId: collectionType === "container" ? id : newEntries[uuid].containerId,
      secondaryContainerId:
        collectionType === "secondaryContainer" ? id : newEntries[uuid].secondaryContainerId,
    }; // entry IDs
  } else {
    newEntries[uuid] = {
      rexStatus: null,
      mass: null,
      markerId: collectionType === "marker" ? id : null,
      containerId: collectionType === "container" ? id : null,
      secondaryContainerId: collectionType === "secondaryContainer" ? id : null,
    };
  }
  runningRexFromDb.actionEntries = newEntries;
  dispatch(upsertRexByField(runningRexFromDb.uuid, "actionEntries", newEntries, true));
  dispatch(upsertRexesFromDb([runningRexFromDb]));

  // update the rex in the database
  const upsertRexRes = await httpClient_Rex.upsertRexes([runningRexFromDb]);
  if (upsertRexRes.status !== "success") {
    throw new Error("Error upserting Rexes for action collection ID: " + upsertRexRes.message);
  }
});

export const thunkMakeExportRexString = appCreateAsyncThunk<
  {
    rexUuid: string;
  },
  string,
  false
>("makeExportRexString", async ({ rexUuid }, { getState }) => {
  /**
   * REX
   */
  const rexes: ExportRex[] = makeExportRexes({
    rexes: getState().rex?.rexes,
  });

  const exportRex = rexes.find((rex) => rex.uuid === rexUuid);

  const selectedExportedData = { rex: exportRex };

  // convert object to readable string
  const sortedJson = jsonKeysSort.sort(selectedExportedData);
  const dataStr = JSON.stringify(sortedJson, null, 2);

  return dataStr;
});

export const thunkJumpToRunningRex = appCreateAsyncThunk<void>(
  "jumpToRunningRex",
  async (_, { getState, dispatch }) => {
    const runningRex = getState().rex.rexes.find((rex) => rex.isRunning);
    if (!runningRex) return;
    dispatch(setSectionSelected("evas"));
    dispatch(setSelectedPosEntryUuid(null));
    dispatch(setSelectedEvaSequenceItemUuid(null));
    dispatch(thunkSetOnlyShowRunningRexEva({ show: true }));
  }
);
