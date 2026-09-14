import isEqual from "lodash/isEqual";
import { serverLogger } from "utils/logging/serverLogger";
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
 * Any entity uuid (station / traverse / action / rex / eva) → the set of EVA
 * uuids that have it. A station may sit in more than one as-planned EVA's
 * sequence (and be the ingress/egress location of others), so its actions are
 * likewise in every one of those EVAs. Traverses are never shared. Entities
 * not belonging to an EVA are absent.
 */
type EvaUuidsByUuid = Map<string, Set<string>>;

/**
 * Build the entity-uuid → owning-EVA-uuids index for a mission.
 */
const buildEvaScopeMap = (mission: Mission): EvaUuidsByUuid => {
  const evaUuidsByUuid: EvaUuidsByUuid = new Map();

  const addToEvaUuid = (uuid: string, evaUuid: string): void => {
    const evaUuids = evaUuidsByUuid.get(uuid);
    if (evaUuids) evaUuids.add(evaUuid);
    else evaUuidsByUuid.set(uuid, new Set([evaUuid]));
  };

  // Rex → its EVA (used for subscription gating).
  for (const rex of Object.values(mission.rexes ?? {})) {
    addToEvaUuid(rex.uuid, rex.evaUuid);
  }

  for (const eva of Object.values(mission.evas ?? {})) {
    // Eva → itself.
    addToEvaUuid(eva.uuid, eva.uuid);
    for (const seqItem of eva.sequence ?? []) {
      addToEvaUuid(seqItem.uuid, eva.uuid);
    }
  }

  // An action belongs to whatever EVAs its parent (station or traverse)
  // belongs to. An action never exists in isolation.
  for (const action of Object.values(mission.actions ?? {})) {
    const parentUuid = action.stationUuid ?? action.traverseUuid ?? null;
    if (!parentUuid) continue;
    const parentEvaUuids = evaUuidsByUuid.get(parentUuid);
    if (!parentEvaUuids) continue;
    for (const evaUuid of parentEvaUuids) addToEvaUuid(action.uuid, evaUuid);
  }

  return evaUuidsByUuid;
};

/**
 * Checks if entity (action/traverse/station...) uuid belongs to a subscribed EVA
 */
const isEntitySubscribed = (
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  uuid: string,
  entityKind: string
): boolean => {
  const allEvaUuids = evaUuidsByUuid.get(uuid);
  if (allEvaUuids) {
    for (const evaUuid of allEvaUuids) {
      if (subscribedEvaUuids.has(evaUuid)) return true;
    }
  }
  serverLogger.warning({
    logId: "socket-maestro-v2",
    logValue:
      `stageMdau - received ${entityKind} data (uuid ${uuid}) for an EVA that Maestro ` +
      `is not subscribed to. Ignoring.`,
  });
  return false;
};

/**
 * Whether a stage carries anything worth writing. Every field on a stage is
 * assigned only when the incoming value differs from the doc, so the presence
 * of any key other than the identifying `uuid` means there is a change —
 * including fields deliberately set to `null`. Stays correct as fields are
 * added to any of the stage types.
 */
const hasStagedChange = (stage: { uuid: string }): boolean =>
  Object.keys(stage).some((key) => key !== "uuid");

/**
 * Validate an incoming `actionOrderUuids`. Maestro may only REORDER existing
 * actions — no additions/deletions. Returns the new order, or `null` if
 * invalid or unchanged.
 */
const stageActionOrder = (
  existingActionOrderUuids: string[] | null | undefined,
  actionOrderUuids: string[],
  parentLabel: string
): string[] | null => {
  const existing = existingActionOrderUuids ?? [];
  if (actionOrderUuids.length !== existing.length) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue:
        `stageMdau - ${parentLabel}: incoming actionOrderUuids length ` +
        `(${actionOrderUuids.length}) does not match existing length (${existing.length}). ` +
        `Maestro may only reorder existing actions. Skipping actionOrder update.`,
    });
    return null;
  }

  // Ensure every incoming uuid is one of the parent's existing actions.
  const existingUuidSet = new Set(existing);
  for (const actionUuid of actionOrderUuids) {
    if (!existingUuidSet.has(actionUuid)) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue:
          `stageMdau - ${parentLabel}: incoming actionOrderUuids contains uuid ` +
          `${actionUuid} that does not match any existing action. Skipping actionOrder update.`,
      });
      return null;
    }
  }

  // Only include if the order actually changed.
  const changed = actionOrderUuids.some((u, i) => u !== existing[i]);
  if (!changed) return null;
  return [...actionOrderUuids];
};

const stageStations = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisStations: NonNullable<MDAU.MaestroDataAegisUses["aegisStations"]>
): StationStage[] => {
  const stages: StationStage[] = [];
  for (const uuid in aegisStations) {
    const mdau = aegisStations[uuid];
    const station = mission.stations[uuid];
    if (!station) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not find station uuid ${uuid}`,
      });
      continue;
    }
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "station")) continue;

    const stage: StationStage = { uuid };
    if (mdau.name !== undefined && mdau.name !== station.name) stage.name = mdau.name;
    if (mdau.duration !== undefined && mdau.duration !== station.duration)
      stage.duration = mdau.duration;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== station.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    if (mdau.actionOrderUuids != null) {
      const newOrder = stageActionOrder(
        station.actionOrderUuids,
        mdau.actionOrderUuids,
        `station ${uuid}`
      );
      if (newOrder) stage.actionOrderUuids = newOrder;
    }

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return stages;
};

const stageTraverses = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisTraverse: NonNullable<MDAU.MaestroDataAegisUses["aegisTraverse"]>
): TraverseStage[] => {
  const stages: TraverseStage[] = [];
  for (const uuid in aegisTraverse) {
    const mdau = aegisTraverse[uuid];
    const traverse = mission.traverses[uuid];
    if (!traverse) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not find traverse uuid ${uuid}`,
      });
      continue;
    }
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "traverse")) continue;

    const stage: TraverseStage = { uuid };
    if (mdau.duration !== undefined && mdau.duration !== traverse.duration)
      stage.duration = mdau.duration;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== traverse.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    if (mdau.actionOrderUuids != null) {
      const newOrder = stageActionOrder(
        traverse.actionOrderUuids,
        mdau.actionOrderUuids,
        `traverse ${uuid}`
      );
      if (newOrder) stage.actionOrderUuids = newOrder;
    }

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return stages;
};

const stageEvas = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisEva: NonNullable<MDAU.MaestroDataAegisUses["aegisEva"]>
): EvaStage[] => {
  const stages: EvaStage[] = [];
  for (const uuid in aegisEva) {
    const mdau = aegisEva[uuid];
    const eva = mission.evas[uuid];
    if (!eva) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not find eva uuid ${uuid}`,
      });
      continue;
    }
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "eva")) continue;

    const stage: EvaStage = { uuid };
    if (mdau.name !== undefined && mdau.name !== eva.name) stage.name = mdau.name;
    if (mdau.datetime !== undefined && mdau.datetime !== eva.datetime)
      stage.datetime = mdau.datetime;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== eva.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return stages;
};

const stageActions = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisAction: NonNullable<MDAU.MaestroDataAegisUses["aegisAction"]>
): ActionStage[] => {
  const stages: ActionStage[] = [];
  for (const uuid in aegisAction) {
    const mdau = aegisAction[uuid];
    const action = mission.actions[uuid];
    if (!action) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageMdau - could not find action uuid ${uuid}`,
      });
      continue;
    }
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "action")) continue;

    const stage: ActionStage = { uuid };
    if (mdau.name !== undefined && mdau.name !== action.name) stage.name = mdau.name;
    if (mdau.descriptionTask !== undefined && mdau.descriptionTask !== action.descriptionTask)
      stage.descriptionTask = mdau.descriptionTask;
    if (mdau.duration !== undefined && mdau.duration !== action.duration)
      stage.duration = mdau.duration;
    if (mdau.stmAction !== undefined && mdau.stmAction !== action.stmAction)
      stage.stmAction = mdau.stmAction;
    if (
      mdau.actionDefinition !== undefined &&
      !isEqual(mdau.actionDefinition, action.actionDefinition)
    )
      stage.actionDefinition = mdau.actionDefinition;
    // `actors` maps to AEGIS `crewAssigned`.
    if (mdau.actors !== undefined && !isEqual(mdau.actors, action.crewAssigned ?? []))
      stage.crewAssigned = mdau.actors as Crew[];
    if (mdau.enabled !== undefined && mdau.enabled !== action.enabled) stage.enabled = mdau.enabled;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== action.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return stages;
};

/**
 * Copy `maestroActivityProperties`, keeping only keys that name a station or
 * traverse present in the doc.
 */
const stageMaestroActivityProperties = (
  mission: Mission,
  incoming: MDAU.MdauRex["maestroActivityProperties"] | null | undefined
): MaestroActivityProperties | null => {
  if (!incoming) return null;
  const result: MaestroActivityProperties = {};
  for (const [uuid, value] of Object.entries(incoming)) {
    if (mission.stations[uuid] || mission.traverses[uuid]) result[uuid] = { ...value };
  }
  return result;
};

const stageRexes = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
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
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, rexUuid, "rex")) continue;

    // Station entries, keyed by station/traverse uuid.
    const stationEntries: RexStage["stationEntries"] = {};
    for (const uuid in mdau.stationEntries) {
      if (!mission.stations[uuid] && !mission.traverses[uuid]) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue: `stageMdau - rex ${rexUuid}: could not find station entry uuid ${uuid}`,
        });
        continue;
      }
      stationEntries[uuid] = { ...mdau.stationEntries[uuid] };
    }

    // Traverse entries.
    const traverseEntries: RexStage["traverseEntries"] = {};
    for (const uuid in mdau.traverseEntries) {
      if (!mission.stations[uuid] && !mission.traverses[uuid]) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue: `stageMdau - rex ${rexUuid}: could not find traverse entry uuid ${uuid}`,
        });
        continue;
      }
      traverseEntries[uuid] = { ...mdau.traverseEntries[uuid] };
    }

    // Action entries.
    const actionEntries: RexStage["actionEntries"] = {};
    for (const uuid in mdau.actionEntries) {
      if (!mission.actions[uuid]) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue: `stageMdau - rex ${rexUuid}: could not find action entry uuid ${uuid}`,
        });
        continue;
      }
      actionEntries[uuid] = { ...mdau.actionEntries[uuid] };
    }

    stages.push({
      uuid: rexUuid,
      updatedAt: mdau.updatedAt,
      fields: {
        petStartStopTimestamp: mdau.petStartStopTimestamp,
        petValueAtStartStop: mdau.petValueAtStartStop,
        petRunning: mdau.petRunning,
        isRunning: mdau.isRunning,
        maestroControlled: mdau.maestroControlled,
      },
      startsRunning: mdau.isRunning && !rex.isRunning,
      maestroActivityProperties: stageMaestroActivityProperties(
        mission,
        mdau.maestroActivityProperties
      ),
      stationEntries,
      traverseEntries,
      actionEntries,
    });
  }
  return stages;
};

/**
 * Build the complete resolved + diffed plan for one `sendMDAU` payload.
 *
 * @param mission             - the current mission doc snapshot
 * @param mdau                - the raw MDAU payload from Maestro
 * @param subscribedEvaUuids  - EVA uuids Maestro is currently subscribed to
 */
export const stageMdau = (
  mission: Mission,
  mdau: MDAU.MaestroDataAegisUses,
  subscribedEvaUuids: Set<string>
): MdauStageData => {
  const evaUuidsByUuid = buildEvaScopeMap(mission);
  return {
    stations: mdau.aegisStations
      ? stageStations(mission, evaUuidsByUuid, subscribedEvaUuids, mdau.aegisStations)
      : [],
    traverses: mdau.aegisTraverse
      ? stageTraverses(mission, evaUuidsByUuid, subscribedEvaUuids, mdau.aegisTraverse)
      : [],
    evas: mdau.aegisEva
      ? stageEvas(mission, evaUuidsByUuid, subscribedEvaUuids, mdau.aegisEva)
      : [],
    actions: mdau.aegisAction
      ? stageActions(mission, evaUuidsByUuid, subscribedEvaUuids, mdau.aegisAction)
      : [],
    rexes: mdau.aegisRexes
      ? stageRexes(mission, evaUuidsByUuid, subscribedEvaUuids, mdau.aegisRexes)
      : [],
  };
};
