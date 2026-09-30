import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";

import { stageDuplicateActions } from "./stage-actions";

/**
 * Build a `StationDuplicationStageData` from a doc mission.
 *
 * Pre-allocates the new station uuid, detaches the cloned station from
 * Automerge proxies, generates a unique name (unless preserveRefUuid), and
 * recursively stages the duplication of all child actions.
 */
export function stageDuplicateStation(
  mission: Mission,
  args: {
    sourceStationUuid: string;
    preserveRefUuid: boolean;
  }
): StationDuplicationStageData | undefined {
  const sourceStation = mission.stations?.[args.sourceStationUuid];
  if (!sourceStation) return undefined;

  // Detach via JSON to fully break any Automerge proxy linkage.
  const newStation: Station = JSON.parse(JSON.stringify(sourceStation));
  newStation.uuid = uuidv4();

  if (!args.preserveRefUuid) {
    newStation.refUuid = uuidv4();
    const now = getAccurateNow().getTime();
    newStation.createdAt = now;
    newStation.updatedAt = now;
    // Only non-lander stations get a unique name.
    if (!sourceStation.isLanderXgress) {
      const allStationNames = Object.values(mission.stations ?? {}).map((s) => s.name);
      newStation.name = makeUniqueStringCopy(sourceStation.name, allStationNames);
    }
  }
  // The new station gets a fresh action ordering — populated by the actions
  // stage below.
  newStation.actionOrderUuids = [];

  // Gather source-station actions in their original order so the duplicates
  // come out the same way.
  const sourceActions = Object.values(mission.actions ?? {})
    .filter((a) => a.stationUuid === sourceStation.uuid)
    .sort(
      (a, b) =>
        (sourceStation.actionOrderUuids?.findIndex((o) => o === a.uuid) ?? 0) -
        (sourceStation.actionOrderUuids?.findIndex((o) => o === b.uuid) ?? 0)
    );

  const actionsStageData = stageDuplicateActions(mission, {
    actions: sourceActions,
    preserveRefUuid: args.preserveRefUuid,
    promotingFromPoi: false,
    parent: { kind: "station", stationUuid: newStation.uuid },
  });

  return {
    oldStationUuid: sourceStation.uuid,
    newStationUuid: newStation.uuid,
    newStation,
    actionsStage: actionsStageData,
  };
}
