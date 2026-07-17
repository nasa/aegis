import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import cloneDeep from "lodash/cloneDeep";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyUpdateRexByField, applyDeletePosSource } from "operations/apply/apply-rex";

export const thunkDocCreatePosSource = appCreateAsyncThunk<void>(
  "createPosSource",
  async (__, { getState }) => {
    const selectedRex = getMissionDocHandle()?.doc()?.rexes[getState().rex.selectedRexUuid];
    if (!selectedRex) return;
    if (selectedRex.posSources.length >= 4) {
      alert("You can only have a maximum of 4 Position Sources.");
      return;
    }
    // Step 1: Validate the pos source count limit and build the new PosSource object.
    const blankPosSource: PosSource = {
      uuid: uuidv4(),
      abbr: "B",
      name: "(Blank)",
    };

    const newRexPosSources: PosSource[] = cloneDeep(selectedRex.posSources) || [];
    newRexPosSources.push(blankPosSource);

    // Step 2: Add the new PosSource to the Rex document.
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    missionDocHandle.change((m: Mission) =>
      applyUpdateRexByField(m, {
        rexUuid: selectedRex.uuid,
        fieldName: "posSources",
        value: newRexPosSources,
        preserveUpdatedAt: true,
      })
    );

    // No Step 3: this thunk has no UI side-effects of its own.
  }
);

export const thunkDocDeletePosSource = appCreateAsyncThunk<
  { rexUuid: string; posSourceUuid: string },
  void,
  string
>("deletePosSource", async ({ rexUuid, posSourceUuid }, { rejectWithValue }) => {
  const doc = getMissionDocHandle()?.doc();
  if (!doc) return;
  const rex = doc.rexes?.[rexUuid];
  if (!rex) return;

  // Step 1: Validate that the PosSource is not in use and that at least one will remain.
  const posEntriesUsingPosSource = rex.posEntries?.filter(
    (posEntry) => posEntry.posSourceUuid === posSourceUuid
  );
  if (posEntriesUsingPosSource?.length > 0) {
    return rejectWithValue(
      "This Position Source is being used by one or more Position Entries. Please delete those Position Entries before deleting this Position Source."
    );
  }

  if (rex.posSources?.length === 1) {
    return rejectWithValue("You must have at least one Position Source.");
  }

  // Step 2: PosSource is safe to delete — remove it from the Rex document.
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  missionDocHandle.change((m: Mission) => applyDeletePosSource(m, { rexUuid, posSourceUuid }));

  // No Step 3: this thunk has no UI side-effects of its own.
});
