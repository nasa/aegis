import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { getAccurateNow } from "utils/formatting";
import { clearPosEntryInEdit } from "store/rex";
import { updateMapDirective } from "store/map";
import { getMissionDocHandle } from "client/automergeDocHandles";
import cloneDeep from "lodash/cloneDeep";
import { applyDeletePosType } from "client/automerge/apply/apply-rex";

/*
 * Update the position entry with a location
 * and then save to automerge. Also called when creating a new position entry
 */
export const thunkDocUpdatePosEntryWithLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
  posEntryUuid: string;
}>("updatePosEntryLoc", async ({ location, posEntryUuid }, { dispatch, getState }) => {
  if (posEntryUuid !== getState().rex.posEntryInEdit?.uuid) {
    throw new Error("Error updating Pos Entry: posEntryUuid does not match the one in edit");
  }

  // Step 1: Read the selected REX UUID and the pos entry in edit from state.
  const selectedRexUuid = getState().rex.selectedRexUuid;
  const posEntryInEdit = getState().rex.posEntryInEdit;
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;

  // Step 2: Update pos entry with the new location, or push a new entry if it doesn't exist yet.
  missionDocHandle.change((m: Mission) => {
    const rex = m.rexes[selectedRexUuid];
    if (!rex) return;
    if (!rex.posEntries) rex.posEntries = [];
    const posEntryIndex = rex.posEntries?.findIndex((p) => p.uuid === posEntryUuid);
    if (posEntryIndex >= 0) {
      // Existing record
      rex.posEntries[posEntryIndex].location = location;
      rex.posEntries[posEntryIndex].updatedAt = getAccurateNow().getTime();
    } else {
      // New entry — push the in-edit one from store with the location applied
      rex.posEntries.push({
        ...posEntryInEdit,
        location,
        updatedAt: getAccurateNow().getTime(),
      });
    }
    rex.updatedAt = getAccurateNow().getTime();
  });

  // Step 3: Clear the pos entry from edit state.
  dispatch(clearPosEntryInEdit());
});

/**
 * Save existing pos entry from redux store when the save button is clicked
 * This does not save a location, just the fields in the pos menu
 */
export const thunkDocSavePosEntryNoLocation = appCreateAsyncThunk<void>(
  "thunkSavePosEntryNoLocation",
  async (__, { dispatch, getState }) => {
    // Step 1: Read the pos entry in edit and selected REX UUID from state.
    const posEntryInEdit = cloneDeep(getState().rex.posEntryInEdit);
    if (!posEntryInEdit) {
      throw new Error("Error cannot save pos entry. No pos entry in edit to save");
    }
    const selectedRexUuid = getState().rex.selectedRexUuid;
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;

    // Step 2: Overwrite the pos entry fields and timestamp in the Automerge doc.
    missionDocHandle.change((m: Mission) => {
      const rex = m.rexes[selectedRexUuid];
      if (!rex) return;
      if (!rex.posEntries) rex.posEntries = [];
      const posEntryIndex = rex.posEntries?.findIndex((p) => p.uuid === posEntryInEdit.uuid);
      if (posEntryIndex === undefined || posEntryIndex < 0) {
        throw new Error("Error cannot save pos entry. Pos entry in edit not found in automerge");
      }
      rex.posEntries[posEntryIndex] = {
        ...rex.posEntries[posEntryIndex],
        ...posEntryInEdit,
        updatedAt: getAccurateNow().getTime(),
      };
      rex.updatedAt = getAccurateNow().getTime();
    });

    // Step 3: Clear the pos entry from edit state.
    dispatch(clearPosEntryInEdit());
  }
);

export const thunkUICancelPosEntryInEdit = appCreateAsyncThunk<void>(
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

export const thunkDocDeletePosEntryByUuid = appCreateAsyncThunk<{
  posEntryUuid: string;
}>("deletePosEntry", async ({ posEntryUuid }, { dispatch, getState }) => {
  // Step 1: Read the selected REX UUID from state.
  const selectedRexUuid = getState().rex.selectedRexUuid;
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;

  // Step 2: Remove the pos entry from the Automerge doc.
  missionDocHandle.change((m: Mission) => {
    const rex = m.rexes[selectedRexUuid];
    if (!rex) return;
    const idx = rex.posEntries?.findIndex((c) => c.uuid === posEntryUuid);
    if (idx !== undefined && idx >= 0) rex.posEntries.splice(idx, 1);
    rex.updatedAt = getAccurateNow().getTime();
  });

  // Step 3: Clear the pos entry from edit state.
  dispatch(clearPosEntryInEdit());
});

export const thunkDocCreatePosType = appCreateAsyncThunk<void>(
  "createPosType",
  async (__, { getState }) => {
    const blankPosType: PosType = {
      uuid: uuidv4(),
      abbr: "1",
      name: "EV1",
      icon: "1f468-200d-1f680", //crew
      pathColor: "#ff0000",
    };

    // Step 1: Build the blank PosType and read the selected REX UUID from state.
    const selectedRexUuid = getState().rex.selectedRexUuid;
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;

    // Step 2: Add the new PosType to the Automerge doc.
    missionDocHandle.change((m: Mission) => {
      const rex = m.rexes[selectedRexUuid];
      if (!rex) return;
      if (!rex.posTypes) rex.posTypes = [];
      rex.posTypes.push(blankPosType);
      rex.updatedAt = getAccurateNow().getTime();
    });

    // No Step 3: this thunk has no UI side-effects of its own.
  }
);

export const thunkDocDeletePosType = appCreateAsyncThunk<
  { rexUuid: string; posTypeUuid: string },
  void,
  string
>("deletePosType", async ({ rexUuid, posTypeUuid }, { rejectWithValue }) => {
  const doc = getMissionDocHandle()?.doc();
  if (!doc) return;
  const rex = doc.rexes?.[rexUuid];
  if (!rex) return;

  // Step 1: Validate that the PosType is not referenced by any existing pos entries.
  const posEntriesUsingPosType = rex.posEntries?.filter((posEntry) =>
    posEntry.posTypeUuids.includes(posTypeUuid)
  );
  if (posEntriesUsingPosType?.length > 0) {
    return rejectWithValue(
      "This Position Item Type is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Item Type."
    );
  }

  // Step 2: PosType is safe to delete — remove it from the Automerge doc.
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  missionDocHandle.change((m: Mission) => applyDeletePosType(m, { rexUuid, posTypeUuid }));

  // No Step 3: this thunk has no UI side-effects of its own.
});
