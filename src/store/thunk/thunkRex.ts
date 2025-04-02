import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { generateUniqueName } from "utils/names/unique-name";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { getAccurateNow, roundDateToSecond, calculatePetValue } from "utils/formatting";
import {
  deleteRexByUuid,
  deleteRexFromDbByUuid,
  setRexEditMode,
  upsertRex,
  upsertRexFromDb,
  setSelectedRexUuid,
  upsertRexByField,
} from "store/rex";
import last from "lodash/last";
import cloneDeep from "lodash/cloneDeep";
import { makeExportRexes } from "utils/export";
import * as jsonKeysSort from "json-keys-sort";
import * as httpClient_Rex from "http-client/rex";
import { thunkSaveNewRex } from "./crossThunk";
import { generateBlankRex } from "store/storeUtils/rex";
import { thunkCancelPosEntry } from "./thunkRexPosEntry";

export const thunkCreateRex = appCreateAsyncThunk<void>(
  "rexCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().rex.rexes.map((rex) => rex.name),
    });

    const blankRex = generateBlankRex({
      missionId: getState().mission.mission.id,
      name: "REX Event " + randomName,
    });
    dispatch(thunkSaveNewRex({ rex: blankRex }));
  }
);

export const thunkDuplicateRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDuplicate",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;

    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

    //make a copy of the rex
    const newRex: Rex = cloneDeep(rex);
    newRex.uuid = uuidv4();
    newRex.updatedAt = null;
    newRex.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newRex.name = makeUniqueStringCopy(
      rex.name,
      getState().rex.rexes.map((rex) => rex.name)
    );

    //new eva is ready to be duplicated in the store.
    dispatch(upsertRex(newRex));
  }
);

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

    const upsertResponse = await httpClient_Rex.upsertRexes([rexToSave]);
    if (upsertResponse.status === "success") {
      // upsert the changed rex to the store
      dispatch(upsertRex(upsertResponse.data[0], true));
      // update the rex in the store from the DB
      dispatch(upsertRexFromDb(upsertResponse.data[0]));
      // take the rex out of edit mode
      dispatch(setRexEditMode({ rexUuid, editMode: false }));
    } else {
      throw new Error("Error upserting Rexes: " + upsertResponse.message);
    }

    // clear running state and stop the clocks of all other rexes in the db
    getState().rex.rexesFromDb.forEach(async (rex) => {
      //skip if this rex is the one being saved or if it isn't running
      if (rex.uuid === rexUuid || !rex.isRunning) return;

      //set the rex to not running and stop the PET timer
      const rexCopy = cloneDeep(rex);
      rexCopy.petRunning = false;
      rexCopy.petValueAtStartStop = calculatePetValue({
        petStartStopTimestamp: rexCopy.petStartStopTimestamp,
        petValueAtStartStop: rexCopy.petValueAtStartStop,
      });
      rexCopy.petStartStopTimestamp = roundDateToSecond(getAccurateNow()).toISOString();
      rexCopy.updatedAt = roundDateToSecond(getAccurateNow()).toISOString();

      const upsertReponse = await httpClient_Rex.upsertRexes([rexCopy]);
      if (upsertReponse.status === "success") {
        // update the rex in the store from the DB
        dispatch(upsertRexFromDb(upsertReponse.data[0]));
      } else {
        throw new Error("Error upserting Rexes: " + upsertReponse.message);
      }
    });
  }
);

export const thunkCancelRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexCancel",
  async ({ rexUuid }, { dispatch, getState }) => {
    const rexFromDb = getState().rex.rexesFromDb.find((rexDb) => rexDb.uuid === rexUuid);

    // if selected rex isn't in the db, delete it from the store
    if (!rexFromDb) {
      dispatch(deleteRexByUuid(rexUuid));
      dispatch(setSelectedRexUuid(null)); // reset since the rex was deleted
    } else {
      // if selected rex is in the db, replace it with the one from the db (undoing any changes)
      dispatch(upsertRex(rexFromDb, true));
    }
    // take the rex out of edit mode
    dispatch(setRexEditMode({ rexUuid, editMode: false }));
  }
);

export const thunkDeleteRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDelete",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;

    // take the rex out of edit mode
    dispatch(setRexEditMode({ rexUuid, editMode: false }));
    dispatch(setSelectedRexUuid(null));

    // delete the rex from the store
    dispatch(deleteRexByUuid(rexUuid));

    //check if rex has been saved to the db
    const rexFromDb = getState().rex.rexesFromDb.find((rexDb) => rexDb.uuid === rexUuid);
    if (rexFromDb) {
      // delete the rex from the db and dbstore
      const deleteResponse = await httpClient_Rex.deleteRexes([rexUuid]);
      if (deleteResponse.status === "success") {
        // remove the corresponding eva from the store
        dispatch(deleteRexFromDbByUuid(rexUuid));
      } else {
        console.error("Error deleting Rex: " + deleteResponse.message);
      }
    }
  }
);

export const thunkRexPetStartStop = appCreateAsyncThunk<{
  rexUuid: string;
  directive: "start" | "stop";
  petValue: string;
}>("rexPetTimerStartStop", async ({ rexUuid, directive, petValue }, { getState, dispatch }) => {
  const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

  dispatch(
    upsertRex({
      ...rex,
      petRunning: directive === "start",
      petValueAtStartStop: petValue,
      petStartStopTimestamp: roundDateToSecond(getAccurateNow()).toISOString(),
    })
  );
});

export const thunkAddRexStatusEntry = appCreateAsyncThunk<{
  entryType: "station" | "traverse" | "action" | "xgress";
  uuid: string; //uuid of the station, traverse, or action to add a status to
  rexStatus: RexStatus;
}>("addRexStatusEntry", async ({ entryType, uuid, rexStatus }, { dispatch, getState }) => {
  const runningRexFromDb = cloneDeep(getState().rex.rexesFromDb.find((rex) => rex.isRunning));
  if (!runningRexFromDb) return;

  //modify the rex object based on the entry type. upsert to both copies in the store
  if (entryType === "station") {
    const newEntry: StationEntry = {
      uuid: uuidv4(),
      rexStatus,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const newEntries = cloneDeep(runningRexFromDb.stationEntries) || {};
    (newEntries[uuid] ||= []).push(newEntry); //logical or assignment. will either return newEntries[uuid] or assign it to []
    runningRexFromDb.stationEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "stationEntries", newEntries, true));
    dispatch(upsertRexFromDb(runningRexFromDb));
  } else if (entryType === "traverse") {
    const newEntry: TraverseEntry = {
      uuid: uuidv4(),
      rexStatus,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const newEntries = cloneDeep(runningRexFromDb.traverseEntries) || {};
    (newEntries[uuid] ||= []).push(newEntry); //logical or assignment. will either return newEntries[uuid] or assign it to []
    runningRexFromDb.traverseEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "traverseEntries", newEntries, true));
    dispatch(upsertRexFromDb(runningRexFromDb));
  } else if (entryType === "action") {
    const newEntry: ActionEntry = {
      uuid: uuidv4(),
      rexStatus,
      mass: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const newEntries = cloneDeep(runningRexFromDb.actionEntries) || {};
    if (newEntries[uuid]) {
      newEntry.mass = last(newEntries[uuid]).mass;
      newEntries[uuid].push(newEntry);
    } else {
      newEntries[uuid] = [newEntry];
    }
    runningRexFromDb.actionEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "actionEntries", newEntries, true));
    dispatch(upsertRexFromDb(runningRexFromDb));
  } else if (entryType === "xgress") {
    const newEntry: XgressEntry = {
      uuid: uuidv4(),
      rexStatus,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const newEntries = cloneDeep(runningRexFromDb.xgressEntries) || {};
    (newEntries[uuid] ||= []).push(newEntry); //logical or assignment. will either return newEntries[uuid] or assign it to []
    runningRexFromDb.xgressEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "xgressEntries", newEntries, true));
    dispatch(upsertRexFromDb(runningRexFromDb));
  }

  // update the rex in the database
  httpClient_Rex.upsertRexes([runningRexFromDb]);
});

export const thunkAddRexActionMass = appCreateAsyncThunk<{
  uuid: string;
  mass: number;
}>("addRexStatusEntry", async ({ uuid, mass }, { dispatch, getState }) => {
  const runningRexFromDb = cloneDeep(getState().rex.rexesFromDb.find((rex) => rex.isRunning));
  if (!runningRexFromDb) return;

  const newEntry: ActionEntry = {
    uuid: uuidv4(),
    rexStatus: null,
    mass,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  const newEntries = cloneDeep(runningRexFromDb.actionEntries) || {};
  if (newEntries[uuid]) {
    newEntry.rexStatus = last(newEntries[uuid]).rexStatus;
    newEntries[uuid].push(newEntry);
  } else {
    newEntries[uuid] = [newEntry];
  }
  runningRexFromDb.actionEntries = newEntries;
  dispatch(upsertRexByField(runningRexFromDb.uuid, "actionEntries", newEntries, true));
  dispatch(upsertRexFromDb(runningRexFromDb));

  // update the rex in the database
  httpClient_Rex.upsertRexes([runningRexFromDb]);
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

  // convert object to readble string
  const sortedJson = jsonKeysSort.sort(selectedExportedData);
  const dataStr = JSON.stringify(sortedJson, null, 2);

  return dataStr;
});
