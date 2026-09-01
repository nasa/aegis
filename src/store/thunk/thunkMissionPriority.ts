import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  applyDeleteMissionPriority,
  applyDeleteMissionPriorityCategory,
} from "operations/apply/apply-mission-priority";
import {
  getMissionPriorityUsages,
  getMissionPriorityUuidsInCategory,
} from "operations/helpers/missionPriorityUsages";
import type { PrintableListItem } from "operations/helpers/geoUnitUsages";

const buildInUseMessage = (subject: string, usages: PrintableListItem[]): string =>
  `${subject} is being used by one or more actions or action templates. Please remove it from the following before deleting.\n\n` +
  usages.map((item) => `${item.parentType}: ${item.parentName} - ${item.actionName}\n`).join("");

export const thunkDocDeleteMissionPriority = appCreateAsyncThunk<
  { missionPriorityUuid: string },
  void,
  string
>("deleteMissionPriority", async ({ missionPriorityUuid }, { rejectWithValue }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;

  // Step 1: Check if the trace is in use; reject with a message if so.
  const usages = getMissionPriorityUsages(mission, new Set([missionPriorityUuid]));
  if (usages.length > 0) {
    return rejectWithValue(buildInUseMessage("This mission priority", usages));
  }

  // Step 2: Not in use — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => applyDeleteMissionPriority(m, { missionPriorityUuid }));

  // No Step 3: this thunk has no UI side-effects of its own.
});

export const thunkDocDeleteMissionPriorityCategory = appCreateAsyncThunk<
  { category: string },
  void,
  string
>("deleteMissionPriorityCategory", async ({ category }, { rejectWithValue }) => {
  const missionDocHandle = getMissionDocHandle();
  if (!missionDocHandle) return;
  const mission = missionDocHandle.doc();
  if (!mission) return;

  // Step 1: Check if any trace in the category is in use; reject with a message if so.
  const uuidsInCategory = getMissionPriorityUuidsInCategory(mission, category);
  const usages = getMissionPriorityUsages(mission, uuidsInCategory);
  if (usages.length > 0) {
    return rejectWithValue(buildInUseMessage(`The "${category}" category`, usages));
  }

  // Step 2: Not in use — delete the category and every trace it contains.
  missionDocHandle.change((m: Mission) => applyDeleteMissionPriorityCategory(m, { category }));

  // No Step 3: this thunk has no UI side-effects of its own.
});
