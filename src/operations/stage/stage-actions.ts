import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";

/**
 * Build an `ActionsDuplicationStageData` describing how to duplicate a list of
 * source actions onto a new parent (station, poi, or traverse).
 *
 * Pure sync: reads the mission, pre-allocates all new uuids, and detaches
 * every cloned action from any Automerge proxy linkage so the apply step can
 * insert them directly.
 */
export function stageDuplicateActions(
  mission: Mission,
  args: {
    actions: Action[];
    preserveRefUuid: boolean;
    promotingFromPoi: boolean;
    parent: ActionsDuplicationParent;
  }
): ActionsDuplicationStageData {
  const { actions, preserveRefUuid, promotingFromPoi, parent } = args;

  // Collect existing actions under the same parent so we can dedupe names.
  const allActions = Object.values(mission.actions ?? {});
  const parentSiblingNames = (() => {
    switch (parent.kind) {
      case "station":
        return allActions.filter((a) => a.stationUuid === parent.stationUuid).map((a) => a.name);
      case "poi":
        return allActions.filter((a) => a.poiUuid === parent.poiUuid).map((a) => a.name);
      case "traverse":
        return allActions.filter((a) => a.traverseUuid === parent.traverseUuid).map((a) => a.name);
    }
  })();

  // Build new action items (detached plain objects, fresh uuids).
  const newActions: ActionDuplicationItem[] = (actions ?? []).map((source) => {
    const newAction: Action = JSON.parse(JSON.stringify(source));
    newAction.uuid = uuidv4();
    newAction.stationUuid = parent.kind === "station" ? parent.stationUuid : null;
    newAction.poiUuid = parent.kind === "poi" ? parent.poiUuid : null;
    newAction.traverseUuid = parent.kind === "traverse" ? parent.traverseUuid : null;

    if (!preserveRefUuid) {
      newAction.refUuid = uuidv4();
      const now = getAccurateNow().getTime();
      newAction.createdAt = now;
      newAction.updatedAt = now;
      newAction.name = makeUniqueStringCopy(newAction.name, parentSiblingNames);
      // Track this name in case multiple actions are duplicated under the same
      // parent in one stage and we need uniqueness across the batch as well.
      parentSiblingNames.push(newAction.name);
    }

    if (promotingFromPoi) {
      newAction.parentActionUuid = source.uuid;
      newAction.parentCopyDate = getAccurateNow().getTime();
    } else {
      newAction.parentActionUuid = source.parentActionUuid;
      newAction.parentCopyDate = source.parentCopyDate;
    }

    return { oldUuid: source.uuid, newUuid: newAction.uuid, newAction };
  });

  // The new actionOrderUuids for the parent is whatever the parent currently
  // has (in the mission) PLUS the new uuids appended in stage order.
  const existingOrder: string[] = (() => {
    switch (parent.kind) {
      case "station":
        return [...(mission.stations?.[parent.stationUuid]?.actionOrderUuids ?? [])];
      case "poi":
        return [...(mission.pois?.[parent.poiUuid]?.actionOrderUuids ?? [])];
      case "traverse":
        return [...(mission.traverses?.[parent.traverseUuid]?.actionOrderUuids ?? [])];
    }
  })();

  return {
    parent,
    preserveRefUuid,
    promotingFromPoi,
    newActions,
    newActionOrderUuids: [...existingOrder, ...newActions.map((i) => i.newUuid)],
  };
}
