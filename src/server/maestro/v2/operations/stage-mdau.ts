import isEqual from "lodash/isEqual";
import { serverLogger } from "utils/logging/serverLogger";
import {
  buildMdauRefUuidMaps,
  resolveActionUuid,
  resolveSequenceUuid,
  resolveStationUuid,
  resolveTraverseUuid,
  type MdauRefUuidMaps,
} from "./buildRefUuidMap";
import type { MDAU } from "../types/mdau";
import type {
  ActionStage,
  EvaStage,
  MdauStageData,
  RexStage,
  StationStage,
  TraverseStage,
} from "../types/mdauStageData";

/**
 * Convert an incoming `actionOrderRefUuids` into resolved `actionOrderUuids`.
 * Maestro may only REORDER existing actions — no additions/deletions. Returns
 * the new order, or `null` if invalid or unchanged.
 */
const stageActionOrder = (
  existingActionOrderUuids: string[] | null | undefined,
  actionOrderRefUuids: string[],
  actionRefUuidToUuid: (refUuid: string) => string | undefined,
  parentLabel: string
): string[] | null => {
  const existing = existingActionOrderUuids ?? [];
  if (actionOrderRefUuids.length !== existing.length) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue:
        `stageMdau - ${parentLabel}: incoming actionOrderRefUuids length ` +
        `(${actionOrderRefUuids.length}) does not match existing length (${existing.length}). ` +
        `Maestro may only reorder existing actions. Skipping actionOrder update.`,
    });
    return null;
  }

  // Ensure every incoming refUuid maps to one of the parent's existing actions.
  const existingUuidSet = new Set(existing);
  const newOrder: string[] = [];
  for (const actionRefUuid of actionOrderRefUuids) {
    const resolved = actionRefUuidToUuid(actionRefUuid);
    if (!resolved || !existingUuidSet.has(resolved)) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue:
          `stageMdau - ${parentLabel}: incoming actionOrderRefUuids contains refUuid ` +
          `${actionRefUuid} that does not match any existing action. Skipping actionOrder update.`,
      });
      return null;
    }
    newOrder.push(resolved);
  }

  // Only include if the order actually changed.
  const changed = newOrder.some((u, i) => u !== existing[i]);
  if (!changed) return null;
  return newOrder;
};

const stageStations = (
  mission: Mission,
  maps: MdauRefUuidMaps,
  aegisStations: NonNullable<MDAU.MaestroDataAegisUses["aegisStations"]>
): StationStage[] => {
  const stages: StationStage[] = [];
  for (const refUuid in aegisStations) {
    const mdau = aegisStations[refUuid];
    const rexUuid = mdau.rexUuid ?? null;
    const uuid = resolveStationUuid(maps, refUuid, rexUuid);
    const station = uuid ? mission.stations[uuid] : undefined;
    if (!uuid || !station) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not resolve station refUuid ${refUuid} rexUuid ${rexUuid}`,
      });
      continue;
    }

    const stage: StationStage = { uuid, updatedAt: mdau.updatedAt };
    if (mdau.name !== undefined && mdau.name !== station.name) stage.name = mdau.name;
    if (mdau.duration !== undefined && mdau.duration !== station.duration)
      stage.duration = mdau.duration;

    if (mdau.actionOrderRefUuids != null) {
      const newOrder = stageActionOrder(
        station.actionOrderUuids,
        mdau.actionOrderRefUuids,
        (r) => resolveActionUuid(maps, r, rexUuid),
        `station ${uuid}`
      );
      if (newOrder) stage.actionOrderUuids = newOrder;
    }

    // Only keep the stage if something beyond uuid/updatedAt changed.
    if (stage.name !== undefined || stage.duration !== undefined || stage.actionOrderUuids)
      stages.push(stage);
  }
  return stages;
};

const stageTraverses = (
  mission: Mission,
  maps: MdauRefUuidMaps,
  aegisTraverse: NonNullable<MDAU.MaestroDataAegisUses["aegisTraverse"]>
): TraverseStage[] => {
  const stages: TraverseStage[] = [];
  for (const refUuid in aegisTraverse) {
    const mdau = aegisTraverse[refUuid];
    const rexUuid = mdau.rexUuid ?? null;
    const uuid = resolveTraverseUuid(maps, refUuid, rexUuid);
    const traverse = uuid ? mission.traverses[uuid] : undefined;
    if (!uuid || !traverse) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not resolve traverse refUuid ${refUuid} rexUuid ${rexUuid}`,
      });
      continue;
    }

    const stage: TraverseStage = { uuid, updatedAt: mdau.updatedAt };
    if (mdau.duration !== undefined && mdau.duration !== traverse.duration)
      stage.duration = mdau.duration;

    if (mdau.actionOrderRefUuids != null) {
      const newOrder = stageActionOrder(
        traverse.actionOrderUuids,
        mdau.actionOrderRefUuids,
        (r) => resolveActionUuid(maps, r, rexUuid),
        `traverse ${uuid}`
      );
      if (newOrder) stage.actionOrderUuids = newOrder;
    }

    if (stage.duration !== undefined || stage.actionOrderUuids) stages.push(stage);
  }
  return stages;
};

const stageEvas = (
  mission: Mission,
  maps: MdauRefUuidMaps,
  aegisEva: NonNullable<MDAU.MaestroDataAegisUses["aegisEva"]>
): EvaStage[] => {
  const stages: EvaStage[] = [];
  for (const refUuid in aegisEva) {
    const mdau = aegisEva[refUuid];
    const rexUuid = mdau.rexUuid ?? null;
    // Resolve the EVA uuid: rex-owned EVA via its rex, else the as-planned EVA.
    let uuid: string | undefined;
    if (rexUuid) {
      uuid = mission.rexes?.[rexUuid]?.evaUuid;
      if (uuid && mission.evas[uuid]?.refUuid !== refUuid) uuid = undefined;
    } else {
      const rexEvaUuids = new Set(Object.values(mission.rexes ?? {}).map((r) => r.evaUuid));
      uuid = Object.values(mission.evas ?? {}).find(
        (e) => !rexEvaUuids.has(e.uuid) && e.refUuid === refUuid
      )?.uuid;
    }
    const eva = uuid ? mission.evas[uuid] : undefined;
    if (!uuid || !eva) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not resolve eva refUuid ${refUuid} rexUuid ${rexUuid}`,
      });
      continue;
    }

    const stage: EvaStage = { uuid, updatedAt: mdau.updatedAt };
    if (mdau.name !== undefined && mdau.name !== eva.name) stage.name = mdau.name;
    if (mdau.ingressDuration !== undefined && mdau.ingressDuration !== eva.ingressDuration)
      stage.ingressDuration = mdau.ingressDuration;
    if (mdau.egressDuration !== undefined && mdau.egressDuration !== eva.egressDuration)
      stage.egressDuration = mdau.egressDuration;

    if (
      stage.name !== undefined ||
      stage.ingressDuration !== undefined ||
      stage.egressDuration !== undefined
    )
      stages.push(stage);
  }
  return stages;
};

const stageActions = (
  mission: Mission,
  maps: MdauRefUuidMaps,
  aegisAction: NonNullable<MDAU.MaestroDataAegisUses["aegisAction"]>
): ActionStage[] => {
  const stages: ActionStage[] = [];
  for (const refUuid in aegisAction) {
    const mdau = aegisAction[refUuid];
    const rexUuid = mdau.rexUuid ?? null;
    const uuid = resolveActionUuid(maps, refUuid, rexUuid);
    const action = uuid ? mission.actions[uuid] : undefined;
    if (!uuid || !action) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not resolve action refUuid ${refUuid} rexUuid ${rexUuid}`,
      });
      continue;
    }

    const stage: ActionStage = { uuid, updatedAt: mdau.updatedAt };
    // `actors` maps to AEGIS `crewAssigned`.
    if (mdau.actors !== undefined && !isEqual(mdau.actors, action.crewAssigned ?? []))
      stage.crewAssigned = mdau.actors as Crew[];

    if (stage.crewAssigned) stages.push(stage);
  }
  return stages;
};

/** Resolve `maestroActivityPropertiesByRefUuid` (refUuid keys) → uuid keys. */
const stageMaestroActivityProperties = (
  maps: MdauRefUuidMaps,
  byRefUuid: MDAU.MdauRex["maestroActivityPropertiesByRefUuid"] | null | undefined,
  rexUuid: string
): MaestroActivityProperties | null => {
  if (!byRefUuid) return null;
  const result: MaestroActivityProperties = {};
  for (const [key, value] of Object.entries(byRefUuid)) {
    // xgress keys are not refUuids — pass through verbatim.
    if (key.endsWith("gress")) {
      result[key] = { ...value };
      continue;
    }
    const uuid = resolveSequenceUuid(maps, key, rexUuid);
    if (uuid) result[uuid] = { ...value };
  }
  return result;
};

const stageRexes = (
  mission: Mission,
  maps: MdauRefUuidMaps,
  aegisRexes: NonNullable<MDAU.MaestroDataAegisUses["aegisRexes"]>
): RexStage[] => {
  const stages: RexStage[] = [];
  for (const rexUuid in aegisRexes) {
    const mdau = aegisRexes[rexUuid];
    const rex = mission.rexes?.[rexUuid];
    if (!rex) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not resolve rex uuid ${rexUuid}`,
      });
      continue;
    }

    // Resolve station entries (keyed by station/traverse refUuid → uuid).
    const stationEntries: RexStage["stationEntries"] = {};
    for (const refUuid in mdau.stationEntriesByRefUuid) {
      const uuid = resolveSequenceUuid(maps, refUuid, rexUuid);
      if (!uuid) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue: `stageMdau - rex ${rexUuid}: could not resolve station entry refUuid ${refUuid}`,
        });
        continue;
      }
      stationEntries[uuid] = { ...mdau.stationEntriesByRefUuid[refUuid] };
    }

    // Resolve traverse entries.
    const traverseEntries: RexStage["traverseEntries"] = {};
    for (const refUuid in mdau.traverseEntriesByRefUuid) {
      const uuid = resolveSequenceUuid(maps, refUuid, rexUuid);
      if (!uuid) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue: `stageMdau - rex ${rexUuid}: could not resolve traverse entry refUuid ${refUuid}`,
        });
        continue;
      }
      traverseEntries[uuid] = { ...mdau.traverseEntriesByRefUuid[refUuid] };
    }

    // Resolve action entries.
    const actionEntries: RexStage["actionEntries"] = {};
    for (const refUuid in mdau.actionEntriesByRefUuid) {
      const uuid = resolveActionUuid(maps, refUuid, rexUuid);
      if (!uuid) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue: `stageMdau - rex ${rexUuid}: could not resolve action entry refUuid ${refUuid}`,
        });
        continue;
      }
      actionEntries[uuid] = { ...mdau.actionEntriesByRefUuid[refUuid] };
    }

    // xgress entries are keyed by xgress uuid (not refUuid) — verbatim.
    const xgressEntries: RexStage["xgressEntries"] = {};
    for (const xgressUuid in mdau.xgressEntries) {
      xgressEntries[xgressUuid] = { ...mdau.xgressEntries[xgressUuid] };
    }

    stages.push({
      uuid: rexUuid,
      fields: {
        petStartStopTimestamp: mdau.petStartStopTimestamp,
        petValueAtStartStop: mdau.petValueAtStartStop,
        petRunning: mdau.petRunning,
        isRunning: mdau.isRunning,
        maestroControlled: mdau.maestroControlled,
      },
      startsRunning: mdau.isRunning && !rex.isRunning,
      maestroActivityProperties: stageMaestroActivityProperties(
        maps,
        mdau.maestroActivityPropertiesByRefUuid,
        rexUuid
      ),
      stationEntries,
      traverseEntries,
      xgressEntries,
      actionEntries,
    });
  }
  return stages;
};

/**
 * Build the complete resolved + diffed plan for one `sendMDAU` payload.
 * Reads data only; never mutates the doc.
 */
export const stageMdau = (mission: Mission, mdau: MDAU.MaestroDataAegisUses): MdauStageData => {
  const maps = buildMdauRefUuidMaps(mission);
  return {
    stations: mdau.aegisStations ? stageStations(mission, maps, mdau.aegisStations) : [],
    traverses: mdau.aegisTraverse ? stageTraverses(mission, maps, mdau.aegisTraverse) : [],
    evas: mdau.aegisEva ? stageEvas(mission, maps, mdau.aegisEva) : [],
    actions: mdau.aegisAction ? stageActions(mission, maps, mdau.aegisAction) : [],
    rexes: mdau.aegisRexes ? stageRexes(mission, maps, mdau.aegisRexes) : [],
  };
};
