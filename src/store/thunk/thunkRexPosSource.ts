import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { upsertToArrayByUuid } from "store/storeUtils/store";
import { upsertRexByField } from "store/rex";
import cloneDeep from "lodash/cloneDeep";

export const thunkCreatePosSource = appCreateAsyncThunk<void>(
  "createPosSource",
  async (__, { dispatch, getState }) => {
    const selectedRex = getState().rex.rexes.find((r) => r.uuid === getState().rex.selectedRexUuid);
    if (selectedRex.posSources.length >= 4) {
      alert("You can only have a maximum of 4 Position Sources.");
      return;
    }
    const blankPosSource: PosSource = {
      uuid: uuidv4(),
      abbr: "B",
      name: "(Blank)",
    };

    const newRexPosSources: PosSource[] = cloneDeep(selectedRex.posSources) || [];
    newRexPosSources.push(blankPosSource);
    dispatch(upsertRexByField(selectedRex.uuid, "posSources", newRexPosSources));
  }
);

export const thunkUpdatePosSourceField = appCreateAsyncThunk<{
  rexUuid: string;
  uuid: string;
  fieldName: keyof PosSource;
  value: PosSource[keyof PosSource];
}>("updatePosSourceField", async ({ rexUuid, uuid, fieldName, value }, { dispatch, getState }) => {
  const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
  const newPosEntrySources = cloneDeep(rex.posSources);
  const itemIndex = newPosEntrySources?.findIndex((item) => item.uuid === uuid);
  if (itemIndex >= 0) {
    (newPosEntrySources[itemIndex] as Record<typeof fieldName, PosSource[keyof PosSource]>)[
      fieldName
    ] = value;
    dispatch(upsertRexByField(rexUuid, "posSources", newPosEntrySources));
  }
});

export const thunkDeletePosSource = appCreateAsyncThunk<{ rexUuid: string; posSourceUuid: string }>(
  "deletePosSource",
  async ({ rexUuid, posSourceUuid }, { dispatch, getState }) => {
    // Look for any posEntries that are using this posSource
    const rex = getState().rex.rexes.find((rex) => rex.uuid === rexUuid);
    const posEntriesUsingPosSource = rex.posEntries?.filter(
      (posEntry) => posEntry.posSourceUuid === posSourceUuid
    );

    if (posEntriesUsingPosSource?.length > 0) {
      alert(
        "This Position Source is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Source."
      );
      return;
    }

    //if this is the last posSource, don't delete it
    if (rex.posSources.length === 1) {
      alert("You must have at least one Position Source.");
      return;
    }

    //this item is not being used. All good to delete it
    const newRexPosSources = cloneDeep(rex.posSources).filter(
      (item) => item.uuid !== posSourceUuid
    );
    dispatch(upsertRexByField(rexUuid, "posSources", newRexPosSources));
  }
);

export const thunkUpdatePosSourceOnPosEntry = appCreateAsyncThunk<{
  rex: Rex;
  posEntryUuid: string;
  posSourceUuid: string;
}>("updatePosSourceOnPosEntry", async ({ rex, posEntryUuid, posSourceUuid }, { dispatch }) => {
  const oldPosEntry = rex.posEntries.find((c) => c.uuid === posEntryUuid);
  let newRexPosEntries: PosEntry[] = cloneDeep(rex.posEntries);
  const newRexPosEntry: PosEntry = {
    ...oldPosEntry,
    posSourceUuid,
  };
  newRexPosEntries = upsertToArrayByUuid(newRexPosEntries, newRexPosEntry);
  dispatch(upsertRexByField(rex.uuid, "posEntries", newRexPosEntries));
});
