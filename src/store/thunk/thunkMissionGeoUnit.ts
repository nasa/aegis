import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyDeleteGeoUnit } from "operations/apply/apply-mission-geoUnit";
import { getGeoUnitUsages } from "operations/helpers/geoUnitUsages";

export const thunkDocDeleteGeoUnit = appCreateAsyncThunk<
  { geographicUnitUuid: string },
  void,
  string
>("deleteGeoUnit", async ({ geographicUnitUuid }, { rejectWithValue }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;

  // Step 1: Check if the geographic unit is in use; reject with message if so.
  const usages = getGeoUnitUsages(mission, geographicUnitUuid);
  if (usages.length > 0) {
    return rejectWithValue(
      "This geographic unit is being used by one or more actions. Please remove it from the following actions before deleting.\n\n" +
        usages
          .map((item) => `${item.parentType}: ${item.parentName} - ${item.actionName}\n`)
          .join("")
    );
  }

  // Step 2: Geographic unit is not in use — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => applyDeleteGeoUnit(m, { geographicUnitUuid }));

  // No Step 3: this thunk has no UI side-effects of its own.
});
