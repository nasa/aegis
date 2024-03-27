import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { generateUniqueName } from "utils/names/unique-name";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { upsertToArrayByUuid } from "utils/store";
import {
  getAccurateNow,
  roundDateToSecond,
  secondsFromhhmmss,
  calculatePetValue,
} from "utils/formatting";
import {
  deleteRexByUuid,
  deleteRexFromDbByUuid,
  setRexEditMode,
  upsertRex,
  upsertRexFromDb,
  deletePosEntryByUuid,
  setPosEntryEditingUuid,
  upsertPosEntry,
  setRexesPosEntryEditMode,
  setSelectedRexUuid,
  upsertRexByField,
} from "store/rex";
import _ from "lodash";
import * as httpClient_Rex from "http-client/rex";
import { thunkSaveNewRex } from "./crossThunk";
import { updateMapDirective } from "store/map";
import { thunkLogRexFull } from "./thunkLog";
import { makeExportRexes } from "utils/export";
import * as jsonKeysSort from "json-keys-sort";

export const thunkCreateRex = appCreateAsyncThunk<void>(
  "rexCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().rex.rexes.map((rex) => rex.name),
    });

    // default crew position item types
    const posTypeEv1: PosType = {
      uuid: uuidv4(),
      abbr: "1",
      name: "EV1",
      icon: "1f468-200d-1f680", //crew
      pathColor: "#ff0000",
    };

    const posTypeEv2: PosType = {
      uuid: uuidv4(),
      abbr: "2",
      name: "EV2",
      icon: "1f469-200d-1f680", //crew
      pathColor: "#ffffff",
    };

    const posTypeCart: PosType = {
      uuid: uuidv4(),
      abbr: "C",
      name: "Cart",
      icon: "1f6d2", //shopping cart
      pathColor: "#AAAAAA",
    };

    const blankRex: Rex = {
      missionId: getState().mission.mission.id,
      uuid: uuidv4(),
      name: "REX Event " + randomName,
      description: "",
      petStartStopTimestamp: null,
      petValueAtStartStop: "+00:00:00",
      petRunning: false,
      evaUuid: null,
      isRunning: false,
      posEntries: null,
      posTypes: [posTypeEv1, posTypeEv2, posTypeCart],
      stationEntries: null,
      traverseEntries: null,
      actionEntries: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
      updatedAt: null,
    };
    dispatch(thunkSaveNewRex({ rex: blankRex }));
  }
);

export const thunkDuplicateRex = appCreateAsyncThunk<{ rexUuid: string }>(
  "rexDuplicate",
  async ({ rexUuid }, { dispatch, getState }) => {
    if (!rexUuid) return;

    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);

    //make a copy of the rex
    const newRex: Rex = _.cloneDeep(rex);
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

    const rexToSave: Rex = _.cloneDeep(rex);
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

    const upsertResponse = await httpClient_Rex.upsertRexes([rexToSave], rexToSave.isRunning);
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

    // log an export of a full copy of this rex and associated eva to the log db table for posterity
    dispatch(
      thunkLogRexFull({ rexUuid, directive: rexToSave.isRunning ? "fullRexStart" : "fullRexStop" })
    );

    // clear running state and stop the clocks of all other rexes in the db
    getState().rex.rexesFromDb.forEach(async (rex) => {
      //skip if this rex is the one being saved or if it isn't running
      if (rex.uuid === rexUuid || !rex.isRunning) return;

      //set the rex to not running and stop the PET timer
      const rexCopy = _.cloneDeep(rex);
      rexCopy.petRunning = false;
      rexCopy.petValueAtStartStop = calculatePetValue({
        petStartStopTimestamp: rexCopy.petStartStopTimestamp,
        petValueAtStartStop: rexCopy.petValueAtStartStop,
      });
      rexCopy.petStartStopTimestamp = roundDateToSecond(getAccurateNow()).toISOString();
      rexCopy.updatedAt = roundDateToSecond(getAccurateNow()).toISOString();

      const upsertReponse = await httpClient_Rex.upsertRexes([rexCopy], rex.isRunning);
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
    const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

    // take the rex out of edit mode
    dispatch(setRexEditMode({ rexUuid, editMode: false }));
    dispatch(setSelectedRexUuid(null));

    // delete the rex from the store
    dispatch(deleteRexByUuid(rexUuid));
    dispatch(deleteRexFromDbByUuid(rexUuid));

    // delete the rex from the db
    httpClient_Rex.deleteRexes([rexUuid], isRexRunning);
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

/*
 * Create an new crew position for an rex but do not save to the db. keep in store only
 * Returns uuid of new crew pos
 */
export const thunkCreatePosEntry = appCreateAsyncThunk<
  {
    posTypeUuids: string[];
  },
  string,
  false
>("createPosEntry", async ({ posTypeUuids }, { dispatch, getState }) => {
  const uuid = uuidv4();
  const runningRex = getState().rex.rexes.find((r) => r.isRunning);
  if (!runningRex) return null;
  const seconds = secondsFromhhmmss(
    runningRex.petRunning ? calculatePetValue(runningRex) : runningRex.petValueAtStartStop
  );
  const newPosEntry: PosEntry = {
    uuid: uuid,
    location: null,
    elevation: null,
    seconds: seconds,
    posTypeUuids: posTypeUuids,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  dispatch(upsertPosEntry({ rexUuid: getState().rex.selectedRexUuid, posEntry: newPosEntry }));
  dispatch(setPosEntryEditingUuid(uuid));
  dispatch(setRexesPosEntryEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: true }));
  return uuid;
});

/*
 * Update the position entry location and then save to db
 */
export const thunkUpdatePosEntryLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  posEntryUuid: string;
}>(
  "updatePosEntryLoc",
  async ({ location, posEntryUuid: posEntryUuid }, { dispatch, getState }) => {
    const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
    const newRexPosEntries: PosEntry[] = _.cloneDeep(selectedRex.posEntries);
    const oldPosEntries = selectedRex.posEntries.find((c) => c.uuid === posEntryUuid);
    const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

    upsertToArrayByUuid(newRexPosEntries, { ...oldPosEntries, location });

    //automatically save to the db.
    const rexUpsertResponse = await httpClient_Rex.upsertRexes(
      [
        {
          ...selectedRex,
          posEntries: newRexPosEntries,
          updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
        },
      ],
      isRexRunning
    );

    if (rexUpsertResponse.status === "success") {
      // upsert the changed rex (with new updated date) to the store
      dispatch(upsertRex(rexUpsertResponse.data[0], true));
      dispatch(upsertRexFromDb(rexUpsertResponse.data[0]));
      dispatch(setPosEntryEditingUuid(null));
    } else {
      throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
    }
    dispatch(
      setRexesPosEntryEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false })
    );
  }
);

/*
 * Update the position types of a pos entry in the store but not the db
 * Db persistence happens when the rex is saved
 */
export const thunkUpdatePosTypesOnPosEntry = appCreateAsyncThunk<{
  rex: Rex;
  posEntryUuid: string;
  posTypeUuids: string[];
}>("updatePosEntryTypes", async ({ rex, posEntryUuid, posTypeUuids }, { dispatch }) => {
  const oldPosEntry = rex.posEntries.find((c) => c.uuid === posEntryUuid);
  let newRexPosEntries: PosEntry[] = _.cloneDeep(rex.posEntries);
  const newRexPosEntry: PosEntry = {
    ...oldPosEntry,
    posTypeUuids,
  };
  newRexPosEntries = upsertToArrayByUuid(newRexPosEntries, newRexPosEntry);
  dispatch(upsertRexByField(rex.uuid, "posEntries", newRexPosEntries));
});

/*
 * Cancel the position entry location
 */
export const thunkCancelPosEntryLocation = appCreateAsyncThunk<{
  posEntryEditingUuid: string;
}>("cancelpositionEntryLoc", async ({ posEntryEditingUuid }, { dispatch, getState }) => {
  const allpositionEntries = getState().rex.rexes.find(
    (r) => r.uuid === getState().rex.selectedRexUuid
  )?.posEntries;
  const positionEntryInEdit = allpositionEntries.find((c) => c.uuid === posEntryEditingUuid);
  if (!positionEntryInEdit.location) {
    //no location means this is a newly created crew pos. delete the uuid currently being edited
    dispatch(
      deletePosEntryByUuid({
        rexUuid: getState().rex.selectedRexUuid,
        posEntryUuid: posEntryEditingUuid,
      })
    );
    dispatch(
      updateMapDirective({
        mapItemType: "posEntry",
        uuid: posEntryEditingUuid,
        mapAction: "cancelCreateMarker",
      })
    );
    dispatch(
      setRexesPosEntryEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false })
    );
    dispatch(setPosEntryEditingUuid(null));
  } else {
    dispatch(
      updateMapDirective({
        mapItemType: "posEntry",
        uuid: posEntryEditingUuid,
        mapAction: "cancelEditMarker",
      })
    );
  }
});

/*
 * Cancel editing an existing pos entry
 */
export const thunkCancelPosEntry = appCreateAsyncThunk<{
  posEntryUuid: string;
}>("cancelPosEntry", async ({ posEntryUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const allPosEntriesFromDb = getState().rex.rexesFromDb.find(
    (r) => r.uuid === getState().rex.selectedRexUuid
  ).posEntries;
  const allPosEntries = getState().rex.rexes.find(
    (r) => r.uuid === getState().rex.selectedRexUuid
  ).posEntries;
  const posEntriesFromDb = allPosEntriesFromDb?.find((c) => c.uuid === posEntryUuid);
  let newAllPosEntries = _.cloneDeep(allPosEntries);

  //cancel out map action if they were in the middle of one for this
  if (getState().map.mapDirective?.uuid === posEntryUuid) {
    dispatch(
      updateMapDirective({
        mapItemType: "posEntry",
        uuid: posEntryUuid,
        mapAction: "cancelEditMarker",
      })
    );
  }

  //Replace only this crew pos with the version from the db
  if (posEntriesFromDb) {
    upsertToArrayByUuid(newAllPosEntries, posEntriesFromDb);
  } else {
    //this crew pos was never saved. Delete it from the store
    newAllPosEntries = newAllPosEntries.filter((c) => c.uuid !== posEntryUuid);
  }

  // upsert the changed rex to the store
  dispatch(upsertRexByField(selectedRex.uuid, "posEntries", newAllPosEntries, true));
  dispatch(setPosEntryEditingUuid(null));
  dispatch(setRexesPosEntryEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
});

export const thunkPersistRexPosEntries = appCreateAsyncThunk<{
  rexUuid: string;
}>("persistPosEntries", async ({ rexUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === rexUuid);

  //automatically save to the db.
  //check rex is running for logging
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;
  const rexUpsertResponse = await httpClient_Rex.upsertRexes(
    [
      {
        ...selectedRex,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    isRexRunning
  );

  if (rexUpsertResponse.status === "success") {
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(rexUpsertResponse.data[0], true));
    dispatch(upsertRexFromDb(rexUpsertResponse.data[0]));
    dispatch(setPosEntryEditingUuid(null));
  } else {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }
  dispatch(setRexesPosEntryEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
});

/*
 * Delete a pos entry from a rex and save to db
 */
export const thunkDeletePosEntryByUuid = appCreateAsyncThunk<{
  posEntryUuid: string;
}>("deletePosEntry", async ({ posEntryUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const newRexPosEntries: PosEntry[] = _.cloneDeep(selectedRex.posEntries).filter(
    (c) => c.uuid !== posEntryUuid
  );
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

  //automatically save to the db.
  const rexUpsertResponse = await httpClient_Rex.upsertRexes(
    [
      {
        ...selectedRex,
        posEntries: newRexPosEntries,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    isRexRunning
  );

  if (rexUpsertResponse.status === "success") {
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(rexUpsertResponse.data[0], true));
    dispatch(upsertRexFromDb(rexUpsertResponse.data[0]));
  } else {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }
});

export const thunkCreatePosType = appCreateAsyncThunk<void>(
  "createPosType",
  async (__, { dispatch, getState }) => {
    const blankPosType: PosType = {
      uuid: uuidv4(),
      abbr: "1",
      name: "EV1",
      icon: "1f468-200d-1f680", //crew
      pathColor: "#ff0000",
    };

    const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
    const newRexPosTypes: PosType[] = _.cloneDeep(selectedRex.posTypes) || [];
    newRexPosTypes.push(blankPosType);

    dispatch(upsertRexByField(selectedRex.uuid, "posTypes", newRexPosTypes));
  }
);

export const thunkUpdatePosTypeField = appCreateAsyncThunk<{
  rexUuid: string;
  uuid: string;
  fieldName: keyof PosType;
  value: PosType[keyof PosType];
}>("updatePosTypeField", async ({ rexUuid, uuid, fieldName, value }, { dispatch, getState }) => {
  const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
  const newPosEntryTypes = _.cloneDeep(rex.posTypes);
  const itemIndex = newPosEntryTypes?.findIndex((item) => item.uuid === uuid);
  if (itemIndex >= 0) {
    (newPosEntryTypes[itemIndex] as Record<typeof fieldName, PosType[keyof PosType]>)[fieldName] =
      value;
    dispatch(upsertRexByField(rexUuid, "posTypes", newPosEntryTypes));
  }
});

export const thunkDeletePosType = appCreateAsyncThunk<{ rexUuid: string; posTypeUuid: string }>(
  "deletePosType",
  async ({ rexUuid, posTypeUuid }, { dispatch, getState }) => {
    // Look for any posEntries that are using this posType
    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
    const posEntriesUsingPosType = rex.posEntries?.filter((posEntry) =>
      posEntry.posTypeUuids.includes(posTypeUuid)
    );

    if (posEntriesUsingPosType.length > 0) {
      alert(
        "This Position Item Type is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Item Type."
      );
      return;
    }

    //this item is not being used. All good to delete it
    const newRexPosTypes = _.cloneDeep(rex.posTypes).filter((item) => item.uuid !== posTypeUuid);
    dispatch(upsertRexByField(rexUuid, "posTypes", newRexPosTypes));
  }
);

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

export const thunkAddRexStatusEntry = appCreateAsyncThunk<{
  entryType: "station" | "traverse" | "action";
  uuid: string; //uuid of the station, traverse, or action to add a status to
  rexStatus: RexStatus;
}>("addRexStatusEntry", async ({ entryType, uuid, rexStatus }, { dispatch, getState }) => {
  const runningRexFromDb = _.cloneDeep(getState().rex.rexesFromDb.find((rex) => rex.isRunning));
  if (!runningRexFromDb) return;

  //modify the rex object based on the entry type. upsert to both copies in the store
  if (entryType === "station") {
    const newEntry: StationEntry = {
      uuid: uuidv4(),
      rexStatus,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const newEntries = _.cloneDeep(runningRexFromDb.stationEntries) || {};
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
    const newEntries = _.cloneDeep(runningRexFromDb.traverseEntries) || {};
    (newEntries[uuid] ||= []).push(newEntry); //logical or assignment. will either return newEntries[uuid] or assign it to []
    runningRexFromDb.traverseEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "traverseEntries", newEntries, true));
    dispatch(upsertRexFromDb(runningRexFromDb));
  } else if (entryType === "action") {
    const newEntry: ActionEntry = {
      uuid: uuidv4(),
      rexStatus,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const newEntries = _.cloneDeep(runningRexFromDb.actionEntries) || {};
    (newEntries[uuid] ||= []).push(newEntry); //logical or assignment. will either return newEntries[uuid] or assign it to []
    runningRexFromDb.actionEntries = newEntries;
    dispatch(upsertRexByField(runningRexFromDb.uuid, "actionEntries", newEntries, true));
    dispatch(upsertRexFromDb(runningRexFromDb));
  }

  // update the rex in the database
  httpClient_Rex.upsertRexes([runningRexFromDb]);
});
