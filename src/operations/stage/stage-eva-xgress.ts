import {
  getEgressStationUuid,
  getIngressIndex,
  getIngressStationUuid,
} from "operations/helpers/evaSequence";
import { generateLanderXgressStation } from "store/storeUtils/station";

import { stageDuplicateStation } from "./stage-station";

/**
 * Plan a change to an EVA's egress or ingress location.
 *
 * Switching between the lander and a different station is a
 * create/delete of the station occupying that position:
 *
 * | From → To             | As-planned EVA                 | REX EVA                                              |
 * | --------------------- | ------------------------------ | ---------------------------------------------------- |
 * | Lander → Station X    | delete lander copy, point at X | delete lander copy, duplicate X, point at copy       |
 * | Station X → Lander    | create lander copy             | delete X copy + its actions, create lander copy      |
 * | Station X → Station Y | point at Y, no copy            | delete X copy + actions, duplicate Y, point at copy  |
 *
 * A REX EVA has its own copies of stations, so it always copies the incoming
 * station and deletes the outgoing one. A planned EVA shares real stations with
 * the rest of the mission and only ever creates/deletes lander copies.
 *
 * Returns `undefined` when the EVA is missing or the position already holds the
 * requested location.
 */
export function stageEvaXgressChange(
  mission: Mission,
  args: {
    evaUuid: string;
    xgressType: "egress" | "ingress";
    /** A station uuid, or `"lander"` to pin the position to the lander. */
    newStationUuidOrLander: string;
    isRexEva: boolean;
    ownerId?: number;
  }
): EvaXgressChangeStageData | undefined {
  const { evaUuid, xgressType, newStationUuidOrLander, isRexEva } = args;
  const eva = mission.evas?.[evaUuid];
  if (!eva) return undefined;

  const oldStationUuid =
    xgressType === "egress"
      ? getEgressStationUuid(eva.sequence)
      : getIngressStationUuid(eva.sequence);
  const sequenceIndex = xgressType === "egress" ? 0 : getIngressIndex(eva.sequence);
  if (!oldStationUuid || sequenceIndex === -1) return undefined;

  const oldStation = mission.stations?.[oldStationUuid];
  const oldIsLanderCopy = oldStation?.isLanderXgress === true;
  const toLander = newStationUuidOrLander === "lander";

  // No-op when the new uuid is the same as the old one
  const currentLocationUuid = oldIsLanderCopy ? "lander" : oldStationUuid;
  if (currentLocationUuid === newStationUuidOrLander) return undefined;

  // ── Handle the new station ───────────────────────────────────────────
  let newLanderStation: Station | undefined;
  let stationStage: StationDuplicationStageData | undefined;
  let newStationUuid: string;

  if (toLander) {
    // Changing to lander. Create a new station
    newLanderStation = generateLanderXgressStation({
      xgressType,
      missionId: mission.id,
      location: mission.landerLocation,
      elevation: mission.landerElevationMeters ?? null,
      ownerId: args.ownerId,
      duration: oldStation?.duration, // Set duration of the new lander copy to the old station's duration
    });
    newStationUuid = newLanderStation.uuid;
  } else if (isRexEva) {
    // Changing to a different station for a REX EVA. Duplicate the station
    stationStage = stageDuplicateStation(mission, {
      sourceStationUuid: newStationUuidOrLander,
      preserveRefUuid: true,
    });
    if (!stationStage) return undefined;
    newStationUuid = stationStage.newStationUuid;
  } else {
    // Changing to a different station for as-planned eva
    if (!mission.stations?.[newStationUuidOrLander]) return undefined;
    newStationUuid = newStationUuidOrLander;
  }

  // ── Handle the old station ──────────────────────────────────────────
  // Old station is deleted if it was a lander, or if this is a rex eva.
  const needToDeleteOldStation = oldIsLanderCopy || isRexEva;
  const stationUuidToDelete = needToDeleteOldStation ? oldStationUuid : undefined;
  const actionUuidsToDelete = stationUuidToDelete
    ? Object.values(mission.actions ?? {})
        .filter((a) => a.stationUuid === stationUuidToDelete)
        .map((a) => a.uuid)
    : [];

  // The sequence as it will look once applied, so the caller can resolve
  // traverse endpoints before committing.
  const newSequence: EvaSequenceItem[] = (eva.sequence as EvaSequenceItem[]).map((item, i) =>
    i === sequenceIndex ? { type: "station", uuid: newStationUuid } : { ...item }
  );

  return {
    evaUuid,
    role: xgressType,
    sequenceIndex,
    newStationUuid,
    newSequence,
    newLanderStation,
    stationStage,
    stationUuidToDelete,
    actionUuidsToDelete,
  };
}
