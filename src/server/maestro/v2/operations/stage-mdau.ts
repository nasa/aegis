import isEqual from "lodash/isEqual";
import { generateBlankAction } from "store/storeUtils/action";
import { getAccurateNow } from "utils/formatting";
import { serverLogger } from "utils/logging/serverLogger";
import type { MDAU } from "../types/mdau";
import type {
  ActionStage,
  EvaStage,
  MdauStageData,
  RexEventInfoStage,
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
 * Actions added or deleted by Maestro, collected while staging the parent
 * stations/traverses. Maestro adds an action by sending a new uuid in
 * `aegisAction` and listing it in its parent's `actionOrderUuids`. It deletes
 * an action by leaving it out of `aegisAction` while sending its parent.
 */
type ActionAddDeleteContext = {
  allMdauAegisActions: MDAU.MaestroDataAegisUses["aegisAction"];
  /** New action uuid → the parent whose incoming actionOrderUuids lists it. */
  addedActionUuidAndParentByUuid: Map<string, { stationUuid?: string; traverseUuid?: string }>;
  deletedActionUuids: Set<string>;
};

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
 * Validate an incoming `actionOrderUuids`. Maestro may reorder the parent's
 * existing actions, leave out actions it is deleting, and include new actions
 * from `aegisAction`. Returns the new order, or `null` if invalid or
 * unchanged.
 */
const stageActionOrder = (
  mission: Mission,
  existingActionOrderUuids: string[] | null | undefined,
  incomingActionOrderUuids: string[],
  parentLabel: string,
  deletedActionUuidsForParent: Set<string>,
  actionAddDeleteContext: ActionAddDeleteContext
): { newOrder: string[]; newActionUuids: string[] } | null => {
  const existing = existingActionOrderUuids ?? [];
  const keptExistingUuids = existing.filter((uuid) => !deletedActionUuidsForParent.has(uuid));
  const keptExistingUuidSet = new Set(keptExistingUuids);

  // A Set automatically removes duplicates. Use this for a quick way to check.
  if (new Set(incomingActionOrderUuids).size !== incomingActionOrderUuids.length) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue:
        `stageMdau - ${parentLabel}: incoming actionOrderUuids contains duplicate uuids. ` +
        `Skipping actionOrder update.`,
    });
    return null;
  }

  // Every incoming uuid must be a kept existing action, or a new action from
  // aegisAction that no other parent has already claimed.
  const newActionUuids: string[] = [];
  for (const actionUuid of incomingActionOrderUuids) {
    if (keptExistingUuidSet.has(actionUuid)) continue;
    const isNewAction =
      actionAddDeleteContext.allMdauAegisActions?.[actionUuid] !== undefined &&
      !mission.actions[actionUuid] &&
      !actionAddDeleteContext.addedActionUuidAndParentByUuid.has(actionUuid);
    if (isNewAction) {
      newActionUuids.push(actionUuid);
      continue;
    }
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue:
        `stageMdau - ${parentLabel}: incoming actionOrderUuids contains uuid ` +
        `${actionUuid} that is not an existing action or a new action from aegisAction. ` +
        `Skipping actionOrder update.`,
    });
    return null;
  }

  // Every existing action that was not deleted must still be listed.
  if (incomingActionOrderUuids.length - newActionUuids.length !== keptExistingUuids.length) {
    serverLogger.warning({
      logId: "socket-maestro-v2",
      logValue:
        `stageMdau - ${parentLabel}: incoming actionOrderUuids is missing existing actions ` +
        `that were not deleted. Skipping actionOrder update.`,
    });
    return null;
  }

  // Only include if the order actually changed.
  const changed =
    incomingActionOrderUuids.length !== existing.length ||
    incomingActionOrderUuids.some((u, i) => u !== existing[i]);
  if (!changed) return null;
  return { newOrder: [...incomingActionOrderUuids], newActionUuids };
};

/**
 * Stage action additions and deletions for one station/traverse in the
 * payload. An existing action of this parent is deleted only when it is
 * missing from both `aegisAction` and the parent's incoming
 * `actionOrderUuids`; nothing is deleted when either is absent.
 * Returns the new `actionOrderUuids`, or `null` if invalid or unchanged.
 */
const stageParentActionChanges = (
  mission: Mission,
  parentUuid: { stationUuid: string } | { traverseUuid: string },
  existingActionOrderUuids: string[] | null | undefined,
  incomingActionOrderUuids: string[] | null | undefined,
  parentLabel: string,
  actionAddDeleteContext: ActionAddDeleteContext
): string[] | null => {
  if (incomingActionOrderUuids == null) return null;

  const deletedActionUuidsForParent = new Set<string>();
  // We have actions to check
  if (actionAddDeleteContext.allMdauAegisActions) {
    const incomingActionOrderUuidSet = new Set(incomingActionOrderUuids);
    // Run through all the mission actions in our copy and find those belonging to this parent entity
    for (const action of Object.values(mission.actions ?? {})) {
      const isChild =
        "stationUuid" in parentUuid
          ? action.stationUuid === parentUuid.stationUuid
          : action.traverseUuid === parentUuid.traverseUuid;
      // We found this action in our copy that belongs to this parent entity, but it is not listed in
      // the aegisActions or in the parent's incoming actionOrderUuids, so it is a deletion
      if (
        isChild &&
        actionAddDeleteContext.allMdauAegisActions[action.uuid] === undefined &&
        !incomingActionOrderUuidSet.has(action.uuid)
      ) {
        deletedActionUuidsForParent.add(action.uuid);
        actionAddDeleteContext.deletedActionUuids.add(action.uuid);
      }
    }
  }

  const staged = stageActionOrder(
    mission,
    existingActionOrderUuids,
    incomingActionOrderUuids,
    parentLabel,
    deletedActionUuidsForParent,
    actionAddDeleteContext
  );
  if (!staged) return null;
  for (const actionUuid of staged.newActionUuids) {
    actionAddDeleteContext.addedActionUuidAndParentByUuid.set(actionUuid, { ...parentUuid });
  }
  return staged.newOrder;
};

const stageStations = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisStations: NonNullable<MDAU.MaestroDataAegisUses["aegisStations"]>,
  actionAddDeleteContext: ActionAddDeleteContext
): StationStage[] => {
  const stages: StationStage[] = [];
  for (const uuid in aegisStations) {
    const mdau = aegisStations[uuid];
    const station = mission.stations[uuid];
    if (!station) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageStations - could not find station uuid ${uuid}`,
      });
      continue;
    }
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "station")) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageStations - station ${uuid} is not part of a subscribed eva`,
      });
      continue;
    }

    const stage: StationStage = { uuid };
    if (mdau.name !== undefined && mdau.name !== station.name) stage.name = mdau.name;
    if (mdau.duration !== undefined && mdau.duration !== station.duration)
      stage.duration = mdau.duration;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== station.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    const newOrder = stageParentActionChanges(
      mission,
      { stationUuid: uuid },
      station.actionOrderUuids,
      mdau.actionOrderUuids,
      `station ${uuid}`,
      actionAddDeleteContext
    );
    if (newOrder) stage.actionOrderUuids = newOrder;

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return stages;
};

const stageTraverses = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisTraverse: NonNullable<MDAU.MaestroDataAegisUses["aegisTraverse"]>,
  actionAddDeleteContext: ActionAddDeleteContext
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
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "traverse")) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageTraverses - traverse ${uuid} is not part of a subscribed eva`,
      });
      continue;
    }

    const stage: TraverseStage = { uuid };
    if (mdau.duration !== undefined && mdau.duration !== traverse.duration)
      stage.duration = mdau.duration;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== traverse.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    const newOrder = stageParentActionChanges(
      mission,
      { traverseUuid: uuid },
      traverse.actionOrderUuids,
      mdau.actionOrderUuids,
      `traverse ${uuid}`,
      actionAddDeleteContext
    );
    if (newOrder) stage.actionOrderUuids = newOrder;

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return stages;
};

const stageEvas = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisEva: NonNullable<MDAU.MaestroDataAegisUses["aegisEva"]>
): { evas: EvaStage[]; rexEventInfo: RexEventInfoStage[] } => {
  const stages: EvaStage[] = [];
  const rexEventInfo: RexEventInfoStage[] = [];
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
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, uuid, "eva")) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stageEvas - eva ${uuid} is not part of a subscribed eva`,
      });
      continue;
    }

    const stage: EvaStage = { uuid };
    if (mdau.name !== undefined && mdau.name !== eva.name) stage.name = mdau.name;
    if (mdau.datetime !== undefined && mdau.datetime !== eva.datetime)
      stage.datetime = mdau.datetime;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== eva.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    if (hasStagedChange(stage)) stages.push(stage);

    // Determine if there is a REX attached to this EVA. If so, update the event id/url if it has changed
    const rex = Object.values(mission.rexes ?? {}).find((r) => r.evaUuid === uuid);
    if (!rex) {
      continue;
    }
    if (
      mdau.maestroEventId !== rex.maestroEventId ||
      mdau.maestroEventUrl !== rex.maestroEventUrl
    ) {
      rexEventInfo.push({
        uuid: rex.uuid,
        maestroEventId: mdau.maestroEventId,
        maestroEventUrl: mdau.maestroEventUrl,
      });
    }
  }
  return { evas: stages, rexEventInfo };
};

const stageActions = (
  mission: Mission,
  evaUuidsByUuid: EvaUuidsByUuid,
  subscribedEvaUuids: Set<string>,
  aegisAction: NonNullable<MDAU.MaestroDataAegisUses["aegisAction"]>,
  actionAddDeleteContext: ActionAddDeleteContext
): { actions: ActionStage[]; newActions: Action[] } => {
  const stages: ActionStage[] = [];
  const newActions: Action[] = [];
  for (const aegisActionUuid in aegisAction) {
    const mdau = aegisAction[aegisActionUuid];
    const action = mission.actions[aegisActionUuid];
    if (!action) {
      // A uuid not in the doc is a new action. Its parent was resolved (and
      // subscription-checked) when the parent's actionOrderUuids was staged.
      const parent = actionAddDeleteContext.addedActionUuidAndParentByUuid.get(aegisActionUuid);
      if (!parent) {
        serverLogger.warning({
          logId: "socket-maestro-v2",
          logValue:
            `stageMdau - new action uuid ${aegisActionUuid} is not listed in the actionOrderUuids ` +
            `of any station or traverse in the payload. Ignoring.`,
        });
        continue;
      }
      newActions.push(
        generateBlankAction({
          uuid: aegisActionUuid,
          missionId: mission.id,
          ...parent,
          name: mdau.name,
          descriptionTask: mdau.descriptionTask,
          duration: mdau.duration,
          actionDefinition: mdau.actionDefinition,
          missionPriorityUuid: mdau.missionPriorityUuid,
          stmAction: mdau.stmAction,
          // `actors` maps to AEGIS `crewAssigned`.
          crewAssigned: mdau.actors as Crew[],
          enabled: mdau.enabled,
          createdAt: getAccurateNow().getTime(),
          updatedAt: mdau.updatedAt,
        })
      );
      continue;
    }
    if (!isEntitySubscribed(evaUuidsByUuid, subscribedEvaUuids, aegisActionUuid, "action")) {
      serverLogger.warning({
        logId: "socket-maestro-v2",
        logValue: `stateActions - action ${aegisActionUuid} is not part of a subscribed eva`,
      });
      continue;
    }

    const stage: ActionStage = { uuid: aegisActionUuid };
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
    if (
      mdau.missionPriorityUuid !== undefined &&
      mdau.missionPriorityUuid !== action.missionPriorityUuid
    )
      stage.missionPriorityUuid = mdau.missionPriorityUuid;
    // `actors` maps to AEGIS `crewAssigned`.
    if (mdau.actors !== undefined && !isEqual(mdau.actors, action.crewAssigned ?? []))
      stage.crewAssigned = mdau.actors as Crew[];
    if (mdau.enabled !== undefined && mdau.enabled !== action.enabled) stage.enabled = mdau.enabled;
    if (mdau.updatedAt !== undefined && mdau.updatedAt !== action.updatedAt)
      stage.updatedAt = mdau.updatedAt;

    if (hasStagedChange(stage)) stages.push(stage);
  }
  return { actions: stages, newActions };
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
  aegisRexes: NonNullable<MDAU.MaestroDataAegisUses["aegisRexes"]>,
  newActionUuids: Set<string>,
  deletedActionUuids: Set<string>
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
      const actionExists = !!mission.actions[uuid] || newActionUuids.has(uuid);
      if (!actionExists || deletedActionUuids.has(uuid)) {
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
      executeEditMode:
        !rex.executeEditState && mdau.executeEditMode !== rex.executeEditMode
          ? mdau.executeEditMode
          : undefined,
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
  const { evas, rexEventInfo } = mdau.aegisEva
    ? stageEvas(mission, evaUuidsByUuid, subscribedEvaUuids, mdau.aegisEva)
    : { evas: [], rexEventInfo: [] };

  // Stations and traverses are staged before actions so their
  // actionOrderUuids resolve the parents of new actions and the deleted set.
  const actionAddDeleteContext: ActionAddDeleteContext = {
    allMdauAegisActions: mdau.aegisAction,
    addedActionUuidAndParentByUuid: new Map(), // actionUuid -> parentUuid (station or traverse)
    deletedActionUuids: new Set(),
  };
  const stations = mdau.aegisStations
    ? stageStations(
        mission,
        evaUuidsByUuid,
        subscribedEvaUuids,
        mdau.aegisStations,
        actionAddDeleteContext
      )
    : [];
  const traverses = mdau.aegisTraverse
    ? stageTraverses(
        mission,
        evaUuidsByUuid,
        subscribedEvaUuids,
        mdau.aegisTraverse,
        actionAddDeleteContext
      )
    : [];
  const { actions, newActions } = mdau.aegisAction
    ? stageActions(
        mission,
        evaUuidsByUuid,
        subscribedEvaUuids,
        mdau.aegisAction,
        actionAddDeleteContext
      )
    : { actions: [], newActions: [] };
  const newActionUuids = new Set(newActions.map((action) => action.uuid));

  return {
    stations,
    traverses,
    evas,
    rexEventInfo,
    actions,
    newActions,
    deletedActionUuids: [...actionAddDeleteContext.deletedActionUuids],
    rexes: mdau.aegisRexes
      ? stageRexes(
          mission,
          evaUuidsByUuid,
          subscribedEvaUuids,
          mdau.aegisRexes,
          newActionUuids,
          actionAddDeleteContext.deletedActionUuids
        )
      : [],
  };
};
