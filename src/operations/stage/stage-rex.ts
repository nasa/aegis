import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateBlankRex } from "store/storeUtils/rex";
import {
  getEgressLocationUuid,
  getIngressLocationUuid,
  isLanderUuid,
} from "operations/helpers/evaSequence";

import { stageDuplicateEva } from "./stage-eva";

/**
 * Build a `RexCreationStageData`.
 * The resulting stage can be applied in a single atomic `.change()`
 */
export function stageCreateRex(
  mission: Mission,
  args: {
    asPlannedEvaUuid: string;
    ownerId: number | null;
  }
): RexCreationStageData | undefined {
  if (!args.asPlannedEvaUuid) {
    throw new Error("Error creating Rex. No EVA uuid provided");
  }

  // 1. Stage the EVA duplication.
  const newEvaStagedData = stageDuplicateEva(mission, {
    sourceEvaUuid: args.asPlannedEvaUuid,
    isRexEva: true,
    includeStations: true,
  });
  if (!newEvaStagedData) return undefined;

  // 2. Create a unique REX name
  const evaUuidsWithSameRefUuid = Object.values(mission.evas ?? {})
    .filter((e) => e.refUuid === newEvaStagedData.newEva.refUuid)
    .map((e) => e.uuid);
  const rexNames = Object.values(mission.rexes ?? {})
    .filter((r) => evaUuidsWithSameRefUuid.includes(r.evaUuid))
    .map((r) => r.name);
  const newRexName = makeUniqueStringCopy("REX", rexNames, false);

  // 3. Build the blank REX with evaUuid pointing at the staged (not-yet-
  //    inserted) EVA's uuid.
  const newRex = generateBlankRex({
    missionId: mission.id,
    name: newRexName,
    evaUuid: newEvaStagedData.newEvaUuid,
    ownerId: args.ownerId,
  });

  return {
    newRexUuid: newRex.uuid,
    newRex,
    evaStage: newEvaStagedData,
  };
}

/**
 * Build a `RexDeletionStageData`.
 *
 * Captures: the REX itself, its EVA, every station referenced by the EVA's
 * sequence, any non-lander ingress/egress stations, every traverse in the sequence, and
 * every action attached to those stations and traverses.
 */
export function stageDeleteRex(
  mission: Mission,
  args: { rexUuid: string }
): RexDeletionStageData | undefined {
  const rex = mission.rexes?.[args.rexUuid];
  if (!rex) return undefined;
  const eva = mission.evas?.[rex.evaUuid];

  // Stations & traverses from the EVA's sequence (when the EVA exists).
  const stationUuids: string[] = [];
  const traverseUuids: string[] = [];
  if (eva) {
    for (const item of eva.sequence ?? []) {
      if (item.type === "station") stationUuids.push(item.uuid);
      else if (item.type === "traverse") traverseUuids.push(item.uuid);
    }
    for (const xgressUuid of [getIngressLocationUuid(eva), getEgressLocationUuid(eva)]) {
      if (xgressUuid && !isLanderUuid(xgressUuid)) stationUuids.push(xgressUuid);
    }
  }

  // Every action attached to any of those stations or traverses.
  const stationSet = new Set(stationUuids);
  const traverseSet = new Set(traverseUuids);
  const actionUuids: string[] = [];
  for (const a of Object.values(mission.actions ?? {})) {
    if (
      (a.stationUuid && stationSet.has(a.stationUuid)) ||
      (a.traverseUuid && traverseSet.has(a.traverseUuid))
    ) {
      actionUuids.push(a.uuid);
    }
  }

  return {
    rexUuid: args.rexUuid,
    evaUuid: rex.evaUuid,
    stationUuids,
    traverseUuids,
    actionUuids,
  };
}
