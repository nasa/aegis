import type { EntityData } from "@mikro-orm/postgresql";
import type { Action_db } from "server/database/models/_allModels";

import { v4 as uuidv4 } from "uuid";

import { getAccurateNow } from "utils/formatting";

/**
 * Generate a blank action
 * @param partialAction any fields that are to be overridden from default
 * @returns the generated action
 */
export const generateBlankAction = (partialAction?: Partial<Action>): Action => {
  const defaultNewAction: Action = {
    uuid: uuidv4(),
    refUuid: uuidv4(),
    name: "",
    missionId: null,
    poiUuid: null,
    stationUuid: null,
    traverseUuid: null,
    parentActionUuid: null,
    parentCopyDate: null,
    priority: null,
    stmPriorities: null,
    type: "other",
    description: "",
    descriptionTask: "",
    stmAction: false,
    actionDefinition: null,
    icon: "26cf-fe0f", //default pickaxe icon
    location: null,
    elevation: null,
    duration: 6,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    mass: null,
    status: "Candidate",
    enabled: true,
    crewAssigned: [],
    createdAt: getAccurateNow().toISOString(),
    updatedAt: null,
  };
  return { ...defaultNewAction, ...partialAction };
};

/**
 * Converts db action fks to their uuid/id arrays
 * @param dbActions an array of actions in mikro db format
 * @returns an a converted array of actions or a single action
 */
export function convertActionsTypeDbToStore(dbActions: Action_db[]): Action[] {
  const actions: Action[] = [];
  for (const dbAction of dbActions) {
    const convertedAction: Action = {
      uuid: dbAction.uuid,
      refUuid: dbAction.refUuid,
      name: dbAction.name,
      missionId: dbAction.mission.id,
      poiUuid: dbAction.poi?.uuid,
      stationUuid: dbAction.station?.uuid,
      traverseUuid: dbAction.traverse?.uuid,
      parentActionUuid: dbAction.parentAction?.uuid,
      parentCopyDate: dbAction.parentCopyDate?.toISOString(),
      priority: dbAction.priority,
      stmPriorities: dbAction.stmPriorities,
      type: dbAction.type,
      description: dbAction.description,
      descriptionTask: dbAction.descriptionTask,
      stmAction: dbAction.stmAction,
      actionDefinition: dbAction.actionDefinition,
      icon: dbAction.icon,
      location: dbAction.location,
      elevation: dbAction.elevation,
      duration: dbAction.duration,
      equipmentItemsUsage: dbAction.equipmentItemsUsage,
      geographicUnitsUsage: dbAction.geographicUnitsUsage,
      mass: dbAction.mass,
      status: dbAction.status,
      enabled: dbAction.enabled,
      crewAssigned: dbAction.crewAssigned,
      createdAt: dbAction.createdAt?.toISOString(),
      updatedAt: dbAction.updatedAt?.toISOString(),
    };
    actions.push(convertedAction);
  }
  return actions;
}

/**
 * Converts actions that come from the store into the db type
 * @param storeActions
 * @returns
 */
export function convertActionsTypeStoreToDb(storeActions: Action[]): EntityData<Action_db>[] {
  const dbActions: EntityData<Action_db>[] = [];
  for (const storeAction of storeActions) {
    const convertedRecord: EntityData<Action_db> = {
      uuid: storeAction.uuid,
      refUuid: storeAction.refUuid,
      name: storeAction.name,
      mission: storeAction.missionId,
      poi: storeAction.poiUuid,
      station: storeAction.stationUuid,
      traverse: storeAction.traverseUuid,
      parentAction: storeAction.parentActionUuid,
      parentCopyDate: storeAction.parentCopyDate ? new Date(storeAction.parentCopyDate) : null,
      priority: storeAction.priority,
      stmPriorities: storeAction.stmPriorities,
      type: storeAction.type,
      description: storeAction.description,
      descriptionTask: storeAction.descriptionTask,
      stmAction: storeAction.stmAction,
      actionDefinition: storeAction.actionDefinition,
      icon: storeAction.icon,
      location: storeAction.location,
      elevation: storeAction.elevation,
      duration: storeAction.duration,
      equipmentItemsUsage: storeAction.equipmentItemsUsage,
      geographicUnitsUsage: storeAction.geographicUnitsUsage,
      mass: storeAction.mass,
      status: storeAction.status,
      enabled: storeAction.enabled,
      crewAssigned: storeAction.crewAssigned,
      updatedAt: new Date(storeAction.updatedAt),
      createdAt: new Date(storeAction.createdAt),
    };
    dbActions.push(convertedRecord);
  }
  return dbActions;
}

export const actionTypes: ActionType[] = [
  "measurement",
  "observation",
  "photo",
  "other",
  "sample",
  "chip",
  "double drive tube",
  "drive tube",
  "float",
  "rake",
  "scoop",
  "sealed scoop",
  "trench",
];
