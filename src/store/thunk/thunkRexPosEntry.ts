import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { upsertToArrayByUuid } from "store/storeUtils/store";
import { getAccurateNow } from "utils/formatting";
import {
  upsertRexes,
  upsertRexesFromDb,
  upsertRexByField,
  upsertPosEntries,
  clearPosEntryInEdit,
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
    if (!runningRex) return null;

    const runningRexEva = getState().eva.evas.find((eva) => eva.uuid === runningRex.evaUuid);
    const posEntryLocation: AEGISPoint =
      runningRexEva?.egressLocationUuid === "lander"
        ? getState().mission.mission.landerLocation
        : getState().station.stations.find(
            (station) => station.uuid === runningRexEva?.egressLocationUuid
          )?.location;

    const newPosEntries = [];
    for (const posSource of runningRex?.posSources) {
      const newPosEntry: PosEntry = {
        uuid: uuidv4(),
        location: posEntryLocation,
        elevation: null,
        petSeconds: 0,
        posTypeUuids: runningRex.posTypes.map((posType) => posType.uuid),
        posSourceUuid: posSource.uuid,
        createdAt: getAccurateNow().toISOString(),
        updatedAt: getAccurateNow().toISOString(),
      };
      newPosEntries.push(newPosEntry);
    }

    dispatch(
      upsertPosEntries({ rexUuid: getState().rex.selectedRexUuid, posEntries: newPosEntries })
    );

    thunkPersistPosEntries({ rexUuid: runningRex.uuid });
  }
);

/*
 * Update the position entry location and then save to db
 */
export const thunkUpdatePosEntryLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  posEntryUuid: string;
}>("updatePosEntryLoc", async ({ location, posEntryUuid }, { dispatch, getState }) => {
  const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
  const newRexPosEntries: PosEntry[] = cloneDeep(selectedRex.posEntries);
  if (posEntryUuid !== getState().rex.posEntryInEdit?.uuid) {
    throw new Error("Error updating Pos Entry: posEntryUuid does not match the one in edit");
  }

  // add the updated pos entry to the array
  upsertToArrayByUuid(newRexPosEntries, { ...getState().rex.posEntryInEdit, location });

  //automatically save to the db.
  const updatedRex = {
    ...selectedRex,
    posEntries: newRexPosEntries,
    updatedAt: getAccurateNow().toISOString(),
  };
  const rexUpsertResponse = await httpClient_Rex.upsertRexes([updatedRex]);

  if (rexUpsertResponse.status !== "success") {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }
  // upsert the changed rex (with new updated date) to the store
  dispatch(upsertRexes([updatedRex], true));
  dispatch(upsertRexesFromDb([updatedRex]));
  dispatch(clearPosEntryInEdit());
});

/*
 * Cancel editing an existing pos entry
 */
export const thunkCancelPosEntryInEdit = appCreateAsyncThunk<void>(
  "cancelPosEntry",
  async (_, { dispatch, getState }) => {
    const posEntryInEdit = getState().rex.posEntryInEdit;

    //cancel out map action if they were in the middle of one for this
    if (getState().map.mapDirective?.uuid === posEntryInEdit.uuid) {
      dispatch(
        updateMapDirective({
          mapItemType: "posEntry",
          uuid: posEntryInEdit.uuid,
          mapAction: "cancelEditMarker",
        })
      );
    }

    dispatch(clearPosEntryInEdit());
  }
);

export const thunkPersistPosEntries = appCreateAsyncThunk<{ rexUuid: string }>(
  "persistPosEntries",
  async ({ rexUuid }, { dispatch, getState }) => {
    const rexRecord = getState().rex.rexes.find((r) => r.uuid === rexUuid);
    const newRexPosEntries: PosEntry[] = cloneDeep(rexRecord.posEntries);
    if (!newRexPosEntries.map((p) => p.uuid).includes(getState().rex.posEntryInEdit?.uuid)) {
      throw new Error(
        "Error saving Pos Entry: None of the pos entries in the rex match the one in edit"
      );
    }
    // add the updated pos entry to the array
    upsertToArrayByUuid(newRexPosEntries, getState().rex.posEntryInEdit);

    //automatically save to the db.
    const updatedRex = {
      ...rexRecord,
      posEntries: newRexPosEntries,
      updatedAt: getAccurateNow().toISOString(),
    };
    const rexUpsertResponse = await httpClient_Rex.upsertRexes([updatedRex]);

    if (rexUpsertResponse.status !== "success") {
      throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
    }
    // upsert the changed rex (with new updated date) to the store
    dispatch(upsertRexes([updatedRex], true));
    dispatch(upsertRexesFromDb([updatedRex]));
    dispatch(clearPosEntryInEdit());
  }
);

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
    updatedAt: getAccurateNow().toISOString(),
  };
  const rexUpsertResponse = await httpClient_Rex.upsertRexes([updatedRex]);
  if (rexUpsertResponse.status !== "success") {
    throw new Error("Error upserting Rex: " + rexUpsertResponse.message);
  }

  // upsert the changed rex (with new updated date) to the store
  dispatch(upsertRexes([updatedRex], true));
  dispatch(upsertRexesFromDb([updatedRex]));
  dispatch(clearPosEntryInEdit());
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
