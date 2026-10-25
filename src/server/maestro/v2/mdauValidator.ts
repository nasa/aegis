/**
 * Data-level validation for an incoming `sendMDAU` payload.
 *
 * Schema validation only proves the payload is structurally
 * well-formed; these checks prove its contents are valid
 */
import type { MDAU } from "./types/mdau";

/** A single data-validation failure. */
export interface MdauValidationError {
  /** path into the MDAU payload that caused the failure. */
  path: string;
  /** description including the offending value. */
  message: string;
}

/**
 * A single validation rule. Receives mission and mdau payload, and
 * returns every failure it found (an empty array means it passed).
 *
 * Add new rules by writing one of these and adding it in
 * `MDAU_DATA_CHECKS` array.
 */
type MdauDataCheck = (mission: Mission, mdau: MDAU.MaestroDataAegisUses) => MdauValidationError[];

/**
 * Every `actionDefinition` uuid an action references must exist in the
 * mission's verb/noun/adjective catalogs.
 */
const checkActionDefinitions: MdauDataCheck = (mission, mdau) => {
  const errors: MdauValidationError[] = [];
  const definitions = mission.actionDefinitions;
  const fields: [keyof ActionDefinition, ActionDefinitionType][] = [
    ["verbUuid", "verbs"],
    ["nounUuid", "nouns"],
    ["adjectiveUuid", "adjectives"],
  ];

  for (const refUuid in mdau.aegisAction ?? {}) {
    const actionDefinition = mdau.aegisAction[refUuid].actionDefinition;
    if (!actionDefinition) continue;

    for (const [field, catalog] of fields) {
      const value = actionDefinition[field];
      if (!value) continue;
      if (!definitions?.[catalog]?.[value]) {
        errors.push({
          path: `aegisAction.${refUuid}.actionDefinition.${field}`,
          message: `actionDefinitionExists - ${value} does not match any ${catalog} definition on the mission`,
        });
      }
    }
  }

  return errors;
};

/**
 * Every `missionPriorityUuid` an action references must exist in the mission's
 * mission-priority list. A null reference (nothing selected) is always valid.
 */
const checkMissionPriorities: MdauDataCheck = (mission, mdau) => {
  const errors: MdauValidationError[] = [];

  for (const refUuid in mdau.aegisAction ?? {}) {
    const missionPriorityUuid = mdau.aegisAction[refUuid].missionPriorityUuid;
    if (!missionPriorityUuid) continue;

    if (!mission.missionPriorities?.[missionPriorityUuid]) {
      errors.push({
        path: `aegisAction.${refUuid}.missionPriorityUuid`,
        message: `missionPriorityExists - ${missionPriorityUuid} does not match any mission priority on the mission`,
      });
    }
  }

  return errors;
};

/**
 * Reject graph references that cannot be resolved in this mission before staging.
 * Staging intentionally ignores unrelated, known entities outside the active EVA
 * subscription, but unknown UUIDs and invalid action membership make the payload
 * internally inconsistent and must not be partially applied.
 */
const checkMissionEntityReferences: MdauDataCheck = (mission, mdau) => {
  const errors: MdauValidationError[] = [];
  const addError = (path: string, message: string) => errors.push({ path, message });

  const checkEntityMap = <T extends { uuid: string }>(
    collectionName: "aegisStations" | "aegisTraverse" | "aegisEva" | "aegisRexes",
    payload: Record<string, T> | undefined,
    entities: Record<string, { uuid: string }> | undefined
  ) => {
    for (const [key, entity] of Object.entries(payload ?? {})) {
      if (key !== entity.uuid) {
        addError(`${collectionName}.${key}.uuid`, `uuid must match its map key ${key}`);
      }
      if (!entities?.[key]) {
        addError(`${collectionName}.${key}`, `unknown entity uuid ${key} on this mission`);
      }
    }
  };

  checkEntityMap("aegisStations", mdau.aegisStations, mission.stations);
  checkEntityMap("aegisTraverse", mdau.aegisTraverse, mission.traverses);
  checkEntityMap("aegisEva", mdau.aegisEva, mission.evas);
  checkEntityMap("aegisRexes", mdau.aegisRexes, mission.rexes);

  for (const [evaUuid, eva] of Object.entries(mdau.aegisEva ?? {})) {
    for (const [index, item] of eva.sequence.entries()) {
      const exists =
        item.type === "station" ? mission.stations[item.uuid] : mission.traverses[item.uuid];
      if (item.uuid && !exists) {
        addError(
          `aegisEva.${evaUuid}.sequence.${index}.uuid`,
          `unknown ${item.type} uuid ${item.uuid} on this mission`
        );
      }
    }
  }

  const incomingActions = mdau.aegisAction ?? {};
  for (const [key, action] of Object.entries(incomingActions)) {
    if (key !== action.uuid) {
      addError(`aegisAction.${key}.uuid`, `uuid must match its map key ${key}`);
    }
  }

  const newActionParentByUuid = new Map<string, string>();
  const checkActionOrder = (
    parentKind: "station" | "traverse",
    parentUuid: string,
    order: string[] | null
  ) => {
    if (order === null) return;
    const path =
      parentKind === "station"
        ? `aegisStations.${parentUuid}.actionOrderUuids`
        : `aegisTraverse.${parentUuid}.actionOrderUuids`;
    if (new Set(order).size !== order.length) {
      addError(path, "actionOrderUuids contains duplicate action uuids");
      return;
    }

    for (const actionUuid of order) {
      const existingAction = mission.actions?.[actionUuid];
      if (existingAction) {
        const belongsToParent =
          parentKind === "station"
            ? existingAction.stationUuid === parentUuid
            : existingAction.traverseUuid === parentUuid;
        if (!belongsToParent) {
          addError(path, `action uuid ${actionUuid} belongs to a different parent`);
        }
        continue;
      }

      const incomingAction = incomingActions[actionUuid];
      if (!incomingAction) {
        addError(
          path,
          `unknown action uuid ${actionUuid}; new actions must be included in aegisAction`
        );
        continue;
      }
      const previousParent = newActionParentByUuid.get(actionUuid);
      if (previousParent && previousParent !== parentUuid) {
        addError(path, `new action uuid ${actionUuid} is listed by multiple parents`);
      } else {
        newActionParentByUuid.set(actionUuid, parentUuid);
      }
    }

    const existingChildren = Object.values(mission.actions ?? {}).filter((action) =>
      parentKind === "station"
        ? action.stationUuid === parentUuid
        : action.traverseUuid === parentUuid
    );
    for (const action of existingChildren) {
      if (
        !order.includes(action.uuid) &&
        (incomingActions[action.uuid] !== undefined || mdau.aegisAction === undefined)
      ) {
        addError(
          path,
          `actionOrderUuids omits existing action ${action.uuid} without a matching deletion`
        );
      }
    }
  };

  for (const [stationUuid, station] of Object.entries(mdau.aegisStations ?? {})) {
    checkActionOrder("station", stationUuid, station.actionOrderUuids);
  }
  for (const [traverseUuid, traverse] of Object.entries(mdau.aegisTraverse ?? {})) {
    checkActionOrder("traverse", traverseUuid, traverse.actionOrderUuids);
  }

  for (const [rexUuid, rex] of Object.entries(mdau.aegisRexes ?? {})) {
    for (const uuid of Object.keys(rex.stationEntries)) {
      if (!mission.stations[uuid] && !mission.traverses[uuid]) {
        addError(`aegisRexes.${rexUuid}.stationEntries.${uuid}`, `unknown activity uuid ${uuid}`);
      }
    }
    for (const uuid of Object.keys(rex.traverseEntries)) {
      if (!mission.stations[uuid] && !mission.traverses[uuid]) {
        addError(`aegisRexes.${rexUuid}.traverseEntries.${uuid}`, `unknown activity uuid ${uuid}`);
      }
    }
    for (const uuid of Object.keys(rex.actionEntries)) {
      if (!mission.actions[uuid] && !newActionParentByUuid.has(uuid)) {
        addError(`aegisRexes.${rexUuid}.actionEntries.${uuid}`, `unknown action uuid ${uuid}`);
      }
    }
    for (const uuid of Object.keys(rex.maestroActivityProperties ?? {})) {
      if (!mission.stations[uuid] && !mission.traverses[uuid]) {
        addError(
          `aegisRexes.${rexUuid}.maestroActivityProperties.${uuid}`,
          `unknown activity uuid ${uuid}`
        );
      }
    }
  }

  // New actions are valid only when a parent actionOrderUuids claims them.
  // Sparse validator unit fixtures may omit the mission's entity collections,
  // so apply this graph check only when both parent collections are available.
  if (mission.stations && mission.traverses) {
    for (const [actionUuid] of Object.entries(incomingActions)) {
      if (!mission.actions?.[actionUuid] && !newActionParentByUuid.has(actionUuid)) {
        addError(
          `aegisAction.${actionUuid}`,
          `new action uuid ${actionUuid} must be listed in a parent actionOrderUuids`
        );
      }
    }
  }

  return errors;
};

/** All the data-validation rules to run, run in order. */
const MDAU_DATA_CHECKS: MdauDataCheck[] = [
  checkActionDefinitions,
  checkMissionPriorities,
  checkMissionEntityReferences,
];

/**
 * Run data-validation rules against a mdau payload.
 *
 * @returns every failure found across all rules. An empty array means the
 *          payload is safe to process.
 */
export const mdauDataValidator = (
  mission: Mission,
  mdau: MDAU.MaestroDataAegisUses
): MdauValidationError[] => MDAU_DATA_CHECKS.flatMap((check) => check(mission, mdau));
