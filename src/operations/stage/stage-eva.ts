import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { clientLogger } from "utils/logging/clientLogger";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";
import {
  getEgressStationUuid,
  getIngressStationUuid,
  getSequenceStationUuids,
  getSequenceTraverseUuids,
} from "operations/helpers/evaSequence";

import { stageDuplicateStation } from "./stage-station";
import { stageDuplicateTraverse } from "./stage-traverse";

/**
 * Build an `EvaDuplicationStageData`.
 *
 * Pre-allocates every uuid (EVA, stations, traverses,
 * ingress/egress, all child actions)
 */
export function stageDuplicateEva(
  mission: Mission,
  args: {
    sourceEvaUuid: string;
    /** Whether this duplication is for creating a REX. */
    isRexEva: boolean;
    /** Whether stations from the source EVA's sequence should be duplicated. */
    includeStations: boolean;
  }
): EvaDuplicationStageData | undefined {
  const sourceEva = mission.evas?.[args.sourceEvaUuid];
  if (!sourceEva) return undefined;

  // Create new EVA's name
  const existingEvaNames = Object.values(mission.evas ?? {}).map((e) => e.name);
  let newName: string;
  if (args.isRexEva) {
    newName = ""; // REX EVAs have no name
  } else if (sourceEva.name) {
    newName = makeUniqueStringCopy(sourceEva.name, existingEvaNames);
  } else {
    // An EVA may not have a name if the user has selected a rex's EVA (these have no names) and then clicks the duplicate button
    // Generate a new name in this case
    newName = generateUniqueName({ dictName: "colors", existingNames: existingEvaNames });
  }

  // Build new EVA
  const newEva: Eva = JSON.parse(JSON.stringify(sourceEva));
  newEva.uuid = uuidv4();
  newEva.name = newName;
  if (!args.isRexEva) {
    const now = getAccurateNow().getTime();
    newEva.updatedAt = now;
    newEva.createdAt = now;
    newEva.refUuid = uuidv4();
  }

  // Stage duplications for the sequence's stations.
  //
  // If xgress is at lander then they are always duplicated regardless of the `includeStations` flag.
  const stagedStationData: StationDuplicationStageData[] = [];
  const stationUuidsToDuplicate = args.includeStations
    ? getSequenceStationUuids(sourceEva.sequence)
    : getLanderXgressStationUuids(mission, sourceEva);
  for (const sourceStationUuid of stationUuidsToDuplicate) {
    const st = stageDuplicateStation(mission, {
      sourceStationUuid,
      preserveRefUuid: args.isRexEva,
    });
    if (st) stagedStationData.push(st);
  }

  // Stage duplications for every traverse in the sequence
  const stagedTraverseData: TraverseDuplicationStageData[] = [];
  for (const traverseUuid of getSequenceTraverseUuids(sourceEva.sequence)) {
    const ts = stageDuplicateTraverse(mission, {
      sourceTraverseUuid: traverseUuid,
      preserveRefUuid: args.isRexEva,
    });
    if (ts) stagedTraverseData.push(ts);
  }

  // Build new EVA sequence with NEW uuids
  // Lookup maps from old uuid → new uuid for fast remap.
  const stationUuidMap = new Map(
    stagedStationData.map((s) => [s.oldStationUuid, s.newStationUuid])
  );
  const traverseUuidMap = new Map(
    stagedTraverseData.map((t) => [t.oldTraverseUuid, t.newTraverseUuid])
  );
  newEva.sequence = sourceEva.sequence.map((item) => {
    if (item.type === "station") {
      const newUuid = stationUuidMap.get(item.uuid);
      if (newUuid === undefined) {
        // This happens when the station was not duplicated (includeStations is false)
        // and doesn't exist in the stationUuidMap.
        return { type: "station", uuid: item.uuid };
      }
      return { type: "station", uuid: newUuid };
    }
    const newUuid = traverseUuidMap.get(item.uuid);
    if (newUuid === undefined) {
      clientLogger.warning(
        `stageDuplicateEva: source traverse uuid "${item.uuid}" not found in traverseUuidMap — setting sequence item uuid to empty string`
      );
      return { type: "traverse", uuid: "" };
    }
    return { type: "traverse", uuid: newUuid };
  });

  return {
    sourceEvaUuid: sourceEva.uuid,
    newEvaUuid: newEva.uuid,
    newEva,
    isRexEva: args.isRexEva,
    includeStations: args.includeStations,
    stationStages: stagedStationData,
    traverseStages: stagedTraverseData,
  };
}

/**
 * Gets the lander stations sitting in this EVA's xgress positions.
 * Returns empty array if there is no lander station in either position.
 */
function getLanderXgressStationUuids(mission: Mission, eva: Eva): string[] {
  return [getEgressStationUuid(eva.sequence), getIngressStationUuid(eva.sequence)].filter(
    (uuid) => uuid && mission.stations?.[uuid]?.isLanderXgress
  );
}

/**
 * Build an `EvaDeletionStageData` from a doc mission synchronously.
 *
 * When `forRex=false` (deleting a planned EVA), also collects the REXes and
 * their EVAs that share the same refUuid so they can be deleted in the same
 * patch.
 *
 * When `forRex=true` (deleting a REX's EVA), it just deletes that one EVA
 * but it includes all the sequence stations/traverses/actions including xgress.
 *
 * Lander stations are always slated for deletion, even for a planned EVA, since
 * they are always duplicated for EVAs
 */
export function stageDeleteEva(
  mission: Mission,
  args: { evaUuid: string; forRex: boolean }
): EvaDeletionStageData | undefined {
  const eva = mission.evas?.[args.evaUuid];
  if (!eva) return undefined;

  // Collect traverse uuids in this EVA
  const traverseUuids: string[] = getSequenceTraverseUuids(eva.sequence);

  // Collect all actions hanging off those traverses
  const traverseActionUuids: string[] = Object.values(mission.actions ?? {})
    .filter((a) => a.traverseUuid && traverseUuids.includes(a.traverseUuid))
    .map((a) => a.uuid);

  let stationUuids: string[] = [];
  let stationActionUuids: string[] = [];

  // If deleting a rex, all stations must be deleted.
  // Otherwise only delete the lander xgress stations since those are copies.
  stationUuids = args.forRex
    ? getSequenceStationUuids(eva.sequence)
    : getLanderXgressStationUuids(mission, eva);
  stationUuids = [...new Set(stationUuids)];

  if (stationUuids.length > 0) {
    stationActionUuids = Object.values(mission.actions ?? {})
      .filter((a) => a.stationUuid && stationUuids.includes(a.stationUuid))
      .map((a) => a.uuid);
  }

  let dependentRexUuids: string[] = [];
  let dependentRexEvaUuids: string[] = [];

  if (!args.forRex) {
    // Find all EVAs with the same refUuid (excludes the primary EVA itself)
    const evaUuidsWithMatchingRefUuid = Object.values(mission.evas ?? {})
      .filter((e) => e.refUuid === eva.refUuid && e.uuid !== eva.uuid)
      .map((e) => e.uuid);

    // Find REXes whose EVAs are in that set
    const dependentRexes = Object.values(mission.rexes ?? {}).filter((r) =>
      evaUuidsWithMatchingRefUuid.includes(r.evaUuid)
    );
    dependentRexUuids = dependentRexes.map((r) => r.uuid);
    dependentRexEvaUuids = dependentRexes.map((r) => r.evaUuid);

    // For each dependent REX EVA, also gather its traverses, stations, and actions
    for (const rexEvaUuid of dependentRexEvaUuids) {
      const rexEva = mission.evas?.[rexEvaUuid];
      if (!rexEva) continue;

      const rexTraverseUuids = getSequenceTraverseUuids(rexEva.sequence);
      traverseUuids.push(...rexTraverseUuids);

      const rexTraverseActionUuids = Object.values(mission.actions ?? {})
        .filter((a) => a.traverseUuid && rexTraverseUuids.includes(a.traverseUuid))
        .map((a) => a.uuid);
      traverseActionUuids.push(...rexTraverseActionUuids);

      const rexStationUuids = getSequenceStationUuids(rexEva.sequence);
      stationUuids.push(...rexStationUuids);

      const rexStationActionUuids = Object.values(mission.actions ?? {})
        .filter((a) => a.stationUuid && rexStationUuids.includes(a.stationUuid))
        .map((a) => a.uuid);
      stationActionUuids.push(...rexStationActionUuids);
    }
  }

  return {
    evaUuid: args.evaUuid,
    traverseUuids,
    traverseActionUuids,
    stationUuids,
    stationActionUuids,
    dependentRexUuids,
    dependentRexEvaUuids,
  };
}
