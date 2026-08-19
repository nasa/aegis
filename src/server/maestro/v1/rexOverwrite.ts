import { v4 as uuidv4 } from "uuid";
import {
  getAutomergeMissions,
  getAutomergeMissionHandle,
} from "../../express/routes/missionAutomerge";

// Update the rex record in the automerge mission document.
// More than one rex may be updated if we need to stop a previously running rex.
// Deprecated - This function should be removed when the socket endpoint for rexOverwrite is removed
export async function overwriteRex(rexOverwrite: RexOverwrite): Promise<Rex[]> {
  if (!rexOverwrite || !rexOverwrite.uuid) return [];

  // Find the mission containing this rex
  const allMissions = await getAutomergeMissions();
  const missionWithRex = allMissions.find((m) => m.rexes?.[rexOverwrite.uuid]);
  if (!missionWithRex) {
    throw new Error(`Rex with uuid ${rexOverwrite.uuid} not found.`);
  }

  const rex = missionWithRex.rexes[rexOverwrite.uuid];
  const eva = missionWithRex.evas?.[rex.evaUuid];
  if (!eva) {
    throw new Error(`Eva with uuid ${rex.evaUuid} not found.`);
  }

  const evaSequenceUuids = eva.sequence.map((s) => s.uuid);

  // Build a mapping of refUuid → uuid for all stations, traverses, and actions in the EVA sequence
  const refUuidToUuid: { [refUuid: string]: string } = {};
  evaSequenceUuids.forEach((uuid) => {
    const station = missionWithRex.stations?.[uuid];
    if (station?.refUuid) refUuidToUuid[station.refUuid] = uuid;
    const traverse = missionWithRex.traverses?.[uuid];
    if (traverse?.refUuid) refUuidToUuid[traverse.refUuid] = uuid;
  });
  Object.values(missionWithRex.actions || {}).forEach((action) => {
    const isInSequence =
      (action.stationUuid && evaSequenceUuids.includes(action.stationUuid)) ||
      (action.traverseUuid && evaSequenceUuids.includes(action.traverseUuid));
    if (isInSequence && action.refUuid) {
      refUuidToUuid[action.refUuid] = action.uuid;
    }
  });

  // Validate all refUuids in the overwrite exist in the eva sequence
  for (const refUuid in rexOverwrite.stationEntriesByRefUuid) {
    if (!refUuidToUuid[refUuid]) {
      throw new Error(`Station with refUuid ${refUuid} not found in eva sequence.`);
    }
  }
  for (const refUuid in rexOverwrite.traverseEntriesByRefUuid) {
    if (!refUuidToUuid[refUuid]) {
      throw new Error(`Traverse with refUuid ${refUuid} not found in eva sequence.`);
    }
  }
  for (const refUuid in rexOverwrite.actionEntriesByRefUuid) {
    if (!refUuidToUuid[refUuid]) {
      throw new Error(`Action with refUuid ${refUuid} not found in eva sequence.`);
    }
  }

  // Determine which other rexes need to be stopped if we are starting
  const rexUuidsToStop: string[] = [];
  if (rexOverwrite.isRunning && !rex.isRunning) {
    for (const uuid in missionWithRex.rexes) {
      if (uuid !== rexOverwrite.uuid && missionWithRex.rexes[uuid].isRunning) {
        rexUuidsToStop.push(uuid);
      }
    }
  }

  const missionDocHandle = await getAutomergeMissionHandle(missionWithRex.id);

  missionDocHandle.change((mission: Mission) => {
    const rexEntity = mission.rexes[rexOverwrite.uuid];
    if (!rexEntity) return;

    // Stop all other running rexes – only one can run at a time
    for (const uuid of rexUuidsToStop) {
      if (mission.rexes[uuid]) {
        mission.rexes[uuid].isRunning = false;
        mission.rexes[uuid].updatedAt = Date.now();
      }
    }

    // Generate initial crew position entries when transitioning to running
    if (rexOverwrite.isRunning && !rexEntity.isRunning) {
      if (!rexEntity.posEntries || rexEntity.posEntries.length === 0) {
        let egressLocation: AEGISPoint | null = null;
        const rexEva = mission.evas?.[rexEntity.evaUuid];
        // Spread location (same as cloning in this case) so we remove the automerge proxy ref
        if (rexEva?.egressLocationUuid === "lander") {
          egressLocation = mission.landerLocation ? { ...mission.landerLocation } : null;
        } else if (rexEva?.egressLocationUuid) {
          const loc = mission.stations?.[rexEva.egressLocationUuid]?.location;
          egressLocation = loc ? { ...loc } : null;
        }

        if (egressLocation) {
          // Do a full array reassignment due to an automerge bug where the push/splice updating to the maestro socket
          rexEntity.posEntries = rexEntity.posSources.map((posSource) => {
            const newPosEntry: PosEntry = {
              uuid: uuidv4(),
              location: egressLocation,
              elevation: null,
              petSeconds: 0,
              posTypeUuids: rexEntity.posTypes.map((posType) => posType.uuid),
              posSourceUuid: posSource.uuid,
              createdAt: new Date().getTime(),
              updatedAt: new Date().getTime(),
            };
            return newPosEntry;
          });
        }
      }
    }

    // Apply station entries
    for (const refUuid in rexOverwrite.stationEntriesByRefUuid) {
      if (!rexEntity.stationEntries) rexEntity.stationEntries = {};
      const stationUuid = refUuidToUuid[refUuid];
      const updatedStationEntry: ActivityEntry = {
        ...rexEntity.stationEntries[stationUuid],
        ...rexOverwrite.stationEntriesByRefUuid[refUuid],
      };
      rexEntity.stationEntries[stationUuid] = updatedStationEntry;
    }

    // Apply traverse entries
    for (const refUuid in rexOverwrite.traverseEntriesByRefUuid) {
      if (!rexEntity.traverseEntries) rexEntity.traverseEntries = {};
      const traverseUuid = refUuidToUuid[refUuid];
      const updatedTraverseEntry: ActivityEntry = {
        ...rexEntity.traverseEntries[traverseUuid],
        ...rexOverwrite.traverseEntriesByRefUuid[refUuid],
      };
      rexEntity.traverseEntries[traverseUuid] = updatedTraverseEntry;
    }

    // Apply action entries
    for (const refUuid in rexOverwrite.actionEntriesByRefUuid) {
      if (!rexEntity.actionEntries) rexEntity.actionEntries = {};
      const actionUuid = refUuidToUuid[refUuid];
      let updatedActionEntry: ActionEntry = rexEntity.actionEntries[actionUuid];
      if (!updatedActionEntry) {
        updatedActionEntry = {
          rexStatus: "pending",
          markerId: "",
          containerId: "",
          secondaryContainerId: "",
        } as ActionEntry;
      }
      updatedActionEntry = {
        ...updatedActionEntry,
        ...rexOverwrite.actionEntriesByRefUuid[refUuid],
      } as ActionEntry;
      rexEntity.actionEntries[actionUuid] = updatedActionEntry;
    }

    // TODO(MR3): egress/ingress REX status is now an ordinary station entry
    // keyed by the xgress station uuid. v1 still sends `xgressEntries` keyed by
    // the literal "egress"/"ingress" role and has no way to express the new
    // shape, so inbound xgress status is dropped here. Decide with the Maestro
    // team whether to resolve the roles onto stations (as v2 now does) or to
    // retire the capability along with v1.

    // Update top-level fields
    rexEntity.petStartStopTimestamp = rexOverwrite.petStartStopTimestamp;
    rexEntity.petValueAtStartStop = rexOverwrite.petValueAtStartStop;
    rexEntity.petRunning = rexOverwrite.petRunning;
    rexEntity.maestroControlled = rexOverwrite.maestroControlled;
    rexEntity.maestroEventId =
      rexOverwrite.maestroEventId === "" ? null : rexOverwrite.maestroEventId;
    rexEntity.isRunning = rexOverwrite.isRunning;
    rexEntity.maestroEventUrl = rexOverwrite.maestroEventUrl;
    rexEntity.maestroActivityPropertiesByRefUuid = rexOverwrite.maestroActivityPropertiesByRefUuid;
    rexEntity.updatedAt = Date.now();
  });

  // Read back the updated rexes from the doc
  const updatedMission = missionDocHandle.doc();
  return [
    updatedMission.rexes[rexOverwrite.uuid],
    ...rexUuidsToStop.map((uuid) => updatedMission.rexes[uuid]),
  ].filter(Boolean);
}
