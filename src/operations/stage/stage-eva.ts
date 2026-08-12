import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";
import { clientLogger } from "utils/logging/clientLogger";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";
import {
  getEgressLocationUuid,
  getIngressLocationUuid,
  getSequenceStationItems,
  getSequenceTraverseItems,
  isLanderUuid,
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

  // Stage duplications for every station in the sequence
  const stagedStationData: StationDuplicationStageData[] = [];
  if (args.includeStations) {
    const seqStationUuids = getSequenceStationItems(sourceEva).map((s) => s.uuid);
    for (const stationUuid of seqStationUuids) {
      const st = stageDuplicateStation(mission, {
        sourceStationUuid: stationUuid,
        preserveRefUuid: args.isRexEva,
      });
      if (st) stagedStationData.push(st);
    }
  }

  // Stage duplications for every traverse in the sequence
  const stagedTraverseData: TraverseDuplicationStageData[] = [];
  const seqTraverseUuids = getSequenceTraverseItems(sourceEva).map((s) => s.uuid);
  for (const traverseUuid of seqTraverseUuids) {
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
        clientLogger.warning(
          `stageDuplicateEva: source station uuid "${item.uuid}" not found in stationUuidMap — setting sequence item uuid to empty string`
        );
        return { type: "station", uuid: "" };
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

  // Stage ingress/egress duplications (only when isRexEva and not lander)
  let ingressStationStage: StationDuplicationStageData | undefined;
  let egressStationStage: StationDuplicationStageData | undefined;
  if (args.isRexEva) {
    if (!isLanderUuid(getIngressLocationUuid(sourceEva))) {
      ingressStationStage = stageDuplicateStation(mission, {
        sourceStationUuid: getIngressLocationUuid(sourceEva),
        preserveRefUuid: true,
      });
      if (ingressStationStage) {
        newEva.ingressLocationUuid = ingressStationStage.newStationUuid;
      } else {
        clientLogger.warning(
          `stageDuplicateEva: could not stage ingress station "${sourceEva.ingressLocationUuid}" — falling back to "lander"`
        );
        newEva.ingressLocationUuid = "lander";
      }
    }
    if (!isLanderUuid(getEgressLocationUuid(sourceEva))) {
      egressStationStage = stageDuplicateStation(mission, {
        sourceStationUuid: getEgressLocationUuid(sourceEva),
        preserveRefUuid: true,
      });
      if (egressStationStage) {
        newEva.egressLocationUuid = egressStationStage.newStationUuid;
      } else {
        clientLogger.warning(
          `stageDuplicateEva: could not stage egress station "${sourceEva.egressLocationUuid}" — falling back to "lander"`
        );
        newEva.egressLocationUuid = "lander";
      }
    }
  }

  return {
    sourceEvaUuid: sourceEva.uuid,
    newEvaUuid: newEva.uuid,
    newEva,
    isRexEva: args.isRexEva,
    includeStations: args.includeStations,
    stationStages: stagedStationData,
    traverseStages: stagedTraverseData,
    ingressStationStage,
    egressStationStage,
  };
}

/**
 * Build an `EvaDeletionStageData` from a doc mission synchronously.
 *
 * When `forRex=false` (deleting a planned EVA), also collects the REXes and
 * their EVAs that share the same refUuid so they can be deleted in the same
 * patch.
 *
 * When `forRex=true` (deleting a REX's EVA), also collects the sequence
 * stations, ingress/egress stations, and their actions.
 */
export function stageDeleteEva(
  mission: Mission,
  args: { evaUuid: string; forRex: boolean }
): EvaDeletionStageData | undefined {
  const eva = mission.evas?.[args.evaUuid];
  if (!eva) return undefined;

  // Collect traverse uuids in this EVA
  const traverseUuids: string[] = getSequenceTraverseItems(eva).map((s) => s.uuid);

  // Collect all actions hanging off those traverses
  const traverseActionUuids: string[] = Object.values(mission.actions ?? {})
    .filter((a) => a.traverseUuid && traverseUuids.includes(a.traverseUuid))
    .map((a) => a.uuid);

  let stationUuids: string[] = [];
  let stationActionUuids: string[] = [];

  if (args.forRex) {
    // Collect sequence station uuids
    stationUuids = getSequenceStationItems(eva).map((s) => s.uuid);

    // Add ingress/egress stations (if not lander)
    for (const xgressUuid of [getIngressLocationUuid(eva), getEgressLocationUuid(eva)]) {
      if (isLanderUuid(xgressUuid)) continue;
      const xgressStation = mission.stations?.[xgressUuid];
      if (xgressStation) stationUuids.push(xgressStation.uuid);
    }

    // Deduplicate: a station may appear in both the sequence and as ingress/egress
    stationUuids = [...new Set(stationUuids)];

    // Collect all actions hanging off those stations
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

      const rexTraverseUuids = getSequenceTraverseItems(rexEva).map((s) => s.uuid);
      traverseUuids.push(...rexTraverseUuids);

      const rexTraverseActionUuids = Object.values(mission.actions ?? {})
        .filter((a) => a.traverseUuid && rexTraverseUuids.includes(a.traverseUuid))
        .map((a) => a.uuid);
      traverseActionUuids.push(...rexTraverseActionUuids);

      const rexStationUuids = getSequenceStationItems(rexEva).map((s) => s.uuid);
      for (const xgressUuid of [getIngressLocationUuid(rexEva), getEgressLocationUuid(rexEva)]) {
        if (isLanderUuid(xgressUuid)) continue;
        const s = mission.stations?.[xgressUuid];
        if (s) rexStationUuids.push(s.uuid);
      }
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
