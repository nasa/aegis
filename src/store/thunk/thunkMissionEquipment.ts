import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { applyDeleteEquipmentItem } from "client/automerge/apply/apply-mission-equipment";
import { getEquipmentItemUsages } from "client/automerge/equipmentItemUsages";

export const thunkDocDeleteEquipmentItem = appCreateAsyncThunk<
  { equipmentItemUuid: string },
  void,
  string
>("deleteEquipmentItem", async ({ equipmentItemUuid }, { rejectWithValue }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;

  // Step 1: Check if the equipment item is in use; reject with message if so.
  const usages = getEquipmentItemUsages(mission, equipmentItemUuid);
  if (usages.length > 0) {
    return rejectWithValue(
      "This equipment item is being used by one or more actions. Please remove it from the following actions before deleting.\n\n" +
        usages
          .map((item) => `${item.parentType}: ${item.parentName} - ${item.actionName}\n`)
          .join("")
    );
  }

  // Step 2: Equipment item is not in use — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => applyDeleteEquipmentItem(m, { equipmentItemUuid }));

  // No Step 3: this thunk has no UI side-effects of its own.
});
