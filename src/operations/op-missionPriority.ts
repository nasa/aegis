import {
  applyDeleteMissionPriority,
  applyDeleteMissionPriorityCategory,
} from "operations/apply/apply-mission-priority";
import { getMissionPriorityUsages } from "operations/helpers/missionPriorityUsages";
import type { PrintableListItem } from "operations/helpers/geoUnitUsages";

const buildInUseMessage = (subject: string, usages: PrintableListItem[]): string =>
  `${subject} is being used by one or more actions or action templates. Please remove it from the following before deleting.\n\n` +
  usages.map((item) => `${item.parentType}: ${item.parentName} - ${item.actionName}\n`).join("");

/**
 * Delete a single mission priority (trace row). Refuses to delete and returns an
 * in-use message if any action or action template still references it.
 *
 * @returns an in-use message if the priority is in use, otherwise `undefined`.
 */
export function opDeleteMissionPriority(
  missionDocHandle: DocHandle<Mission>,
  missionPriorityUuid: string
): string | undefined {
  if (!missionDocHandle || !missionPriorityUuid) return undefined;
  const mission = missionDocHandle.doc();
  if (!mission) return undefined;

  // Step 1: Check if the trace is in use; return a message if so.
  const usages = getMissionPriorityUsages(mission, new Set([missionPriorityUuid]));
  if (usages.length > 0) {
    return buildInUseMessage("This mission priority", usages);
  }

  // Step 2: Not in use — delete it from the Automerge doc.
  missionDocHandle.change((m: Mission) => applyDeleteMissionPriority(m, { missionPriorityUuid }));

  return undefined;
}

/**
 * Delete an entire mission priority category, along with every trace row it contains.
 * Refuses to delete and returns an in-use message if any trace in the category is
 * still referenced by an action or action template.
 *
 * @returns an in-use message if any trace is in use, otherwise `undefined`.
 */
export function opDeleteMissionPriorityCategory(
  missionDocHandle: DocHandle<Mission>,
  category: string
): string | undefined {
  if (!missionDocHandle || !category) return undefined;
  const mission = missionDocHandle.doc();
  if (!mission) return undefined;

  // Step 1: Check if any trace in the category is in use; return a message if so.
  const uuidsInCategory = new Set<string>();
  for (const [uuid, missionPriority] of Object.entries(mission.missionPriorities ?? {})) {
    if (missionPriority.category === category) uuidsInCategory.add(uuid);
  }
  const usages = getMissionPriorityUsages(mission, uuidsInCategory);
  if (usages.length > 0) {
    return buildInUseMessage(`The "${category}" category`, usages);
  }

  // Step 2: Not in use — delete the category and every trace it contains.
  missionDocHandle.change((m: Mission) => applyDeleteMissionPriorityCategory(m, { category }));

  return undefined;
}
