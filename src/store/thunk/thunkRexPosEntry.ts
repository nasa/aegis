import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { upsertToArrayByUuid } from "store/storeUtils/store";
import {
  getAccurateNow,
  roundDateToSecond,
  secondsFromhhmmss,
  calculatePetValue,
} from "utils/formatting";
import {
  upsertRex,
  upsertRexFromDb,
  deletePosEntryByUuid,
  setPosEntryEditingUuid,
  setRexesPosEntryEditMode,
  upsertRexByField,
  upsertPosEntries,
} from "store/rex";
import cloneDeep from "lodash/cloneDeep";
import * as httpClient_Rex from "http-client/rex";
import { updateMapDirective } from "store/map";

/*
 * Create initial crew positions for a running rex if they do not already exist
 */
export const thunkCreateInitialPosEntries = appCreateAsyncThunk<void>(
  "createInitialPosEntries",
  async (__, { dispatch, getState }) => {
    const runningRex = getState().rex.rexes.find((r) => r.isRunning);
    const runningRexEva = getState().eva.evas.find((eva) => eva.uuid === runningRex.evaUuid);
    const mission = getState().mission.mission;
    const stationList = getState().station.stations;
    if (!runningRex) return null;

    const posEntryLocation: AEGISPoint =
      runningRexEva?.egressLocationUuid === "lander"
        ? mission.landerLocation
        : stationList.find((station) => station.uuid === runningRexEva?.egressLocationUuid)
            ?.location;
    const seconds = 0;

    const newPosEntries = [];

    for (const posSource of runningRex?.posSources) {
      // Find all posTypes that are not already in a posEntry for this posSource
      const entrylessPosTypeUuids = runningRex.posTypes
        .filter((posType) => {
          return !runningRex.posEntries?.some(
            (entry: PosEntry) =>
              entry.posTypeUuids.includes(posType.uuid) && entry.posSourceUuid === posSource.uuid
          );
        })
        .map((posType) => posType.uuid);

      const newUuid = uuidv4();

      const newPosEntry: PosEntry = {
        uuid: newUuid,
        location: posEntryLocation,
        elevation: null,
        seconds: seconds,
        posTypeUuids: entrylessPosTypeUuids,
        posSourceUuid: posSource.uuid,
        createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      };
      newPosEntries.push(newPosEntry);
    }

    await dispatch(
      upsertPosEntries({ rexUuid: getState().rex.selectedRexUuid, posEntries: newPosEntries })
    );

    thunkPersistPosEntries({ rexUuid: runningRex.uuid });
  }
);

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
  const newPosEntries: PosEntry[] = [];
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
    posSourceUuid: getState().rex.selectedPosSourceUuid,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  newPosEntries.push(newPosEntry);
  dispatch(
    upsertPosEntries({ rexUuid: getState().rex.selectedRexUuid, posEntries: newPosEntries })
  );
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
    const newRexPosEntries: PosEntry[] = cloneDeep(selectedRex.posEntries);
    const oldPosEntries = selectedRex.posEntries.find((c) => c.uuid === posEntryUuid);

    upsertToArrayByUuid(newRexPosEntries, { ...oldPosEntries, location });

    //automatically save to the db.
    const updatedRex = {
      ...selectedRex,
      posEntries: newRexPosEntries,
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    const rexUpsertResponse = await httpClient_Rex.upsertRexes([updatedRex]);

    if (rexUpsertResponse.status !== "success") {
      throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
    }
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRex(updatedRex, true));
    dispatch(upsertRexFromDb(updatedRex));
    dispatch(setPosEntryEditingUuid(null));
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
  rexUuid: string;
  posEntryUuid: string;
  posTypeUuids: string[];
}>(
  "updatePosEntryTypes",
  async ({ rexUuid, posEntryUuid, posTypeUuids }, { dispatch, getState }) => {
    const rex = getState().rex.rexes.find((r) => r.uuid === rexUuid);
    const oldPosEntry = rex.posEntries.find((c) => c.uuid === posEntryUuid);
    let newRexPosEntries: PosEntry[] = cloneDeep(rex.posEntries);
    const newRexPosEntry: PosEntry = {
      ...oldPosEntry,
      posTypeUuids,
    };
    newRexPosEntries = upsertToArrayByUuid(newRexPosEntries, newRexPosEntry);
    dispatch(upsertRexByField(rexUuid, "posEntries", newRexPosEntries));
  }
);

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
  let newAllPosEntries = cloneDeep(allPosEntries);

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

export const thunkPersistPosEntries = appCreateAsyncThunk<{
  rexUuid: string;
}>("persistPosEntries", async ({ rexUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === rexUuid);

  //automatically save to the db.
  const updatedRex = {
    ...selectedRex,
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  const rexUpsertResponse = await httpClient_Rex.upsertRexes([updatedRex]);

  if (rexUpsertResponse.status !== "success") {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }
  // upsert the changed rex (with new updated date) to the store
  dispatch(upsertRex(updatedRex, true));
  dispatch(upsertRexFromDb(updatedRex));
  dispatch(setPosEntryEditingUuid(null));
  dispatch(setRexesPosEntryEditMode({ rexUuid: getState().rex.selectedRexUuid, editMode: false }));
});

/*
 * Delete a pos entry from a rex and save to db
 */
export const thunkDeletePosEntryByUuid = appCreateAsyncThunk<{
  posEntryUuid: string;
}>("deletePosEntry", async ({ posEntryUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const newRexPosEntries: PosEntry[] = cloneDeep(selectedRex.posEntries).filter(
    (c) => c.uuid !== posEntryUuid
  );

  //automatically save to the db.
  const updatedRex = {
    ...selectedRex,
    posEntries: newRexPosEntries,
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  const rexUpsertResponse = await httpClient_Rex.upsertRexes([updatedRex]);
  if (rexUpsertResponse.status !== "success") {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }

  // upsert the changed rex (with new updated date) to the store
  dispatch(upsertRex(updatedRex, true));
  dispatch(upsertRexFromDb(updatedRex));
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
    const newRexPosTypes: PosType[] = cloneDeep(selectedRex.posTypes) || [];
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
  const newPosEntryTypes = cloneDeep(rex.posTypes);
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
    const newRexPosTypes = cloneDeep(rex.posTypes).filter((item) => item.uuid !== posTypeUuid);
    dispatch(upsertRexByField(rexUuid, "posTypes", newRexPosTypes));
  }
);
