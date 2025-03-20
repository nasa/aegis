import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Action_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank action
 * @param partialAction any fields that are to be overriden from default
 * @returns the generated action
 */
export const generateBlankAction = (partialAction?: Partial<Action>): Action => {
  const defaultNewAction: Action = {
    uuid: uuidv4(),
    name: "",
    missionId: null,
    poiUuid: null,
    stationUuid: null,
    traverseUuid: null,
    parentActionUuid: null,
    parentCopyDate: null,
    priority: null,
    stmUuidRefs: null,
    stmPriorities: null,
    type: "other",
    description: "",
    stmAction: false,
    actionDefinition: null,
    icon: "26cf-fe0f", //default pickaxe icon
    location: null,
    elevation: null,
    durationLower: 5,
    durationUpper: 6,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    mass: null,
    status: "Candidate",
    enabled: true,
    crewAssigned: [],
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
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
  for (const dbaction of dbActions) {
    const convertedAction: Action = {
      uuid: dbaction.uuid,
      name: dbaction.name,
      missionId: dbaction.mission.id,
      poiUuid: dbaction.poi?.uuid,
      stationUuid: dbaction.station?.uuid,
      traverseUuid: dbaction.traverse?.uuid,
      parentActionUuid: dbaction.parentAction?.uuid,
      parentCopyDate: dbaction.parentCopyDate?.toISOString(),
      priority: dbaction.priority,
      stmUuidRefs: dbaction.stmUuidRefs,
      stmPriorities: dbaction.stmPriorities,
      type: dbaction.type,
      description: dbaction.description,
      stmAction: dbaction.stmAction,
      actionDefinition: dbaction.actionDefinition,
      icon: dbaction.icon,
      location: dbaction.location,
      elevation: dbaction.elevation,
      durationLower: dbaction.durationLower,
      durationUpper: dbaction.durationUpper,
      equipmentItemsUsage: dbaction.equipmentItemsUsage,
      geographicUnitsUsage: dbaction.geographicUnitsUsage,
      mass: dbaction.mass,
      status: dbaction.status,
      enabled: dbaction.enabled,
      crewAssigned: dbaction.crewAssigned,
      createdAt: dbaction.createdAt?.toISOString(),
      updatedAt: dbaction.updatedAt?.toISOString(),
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
      name: storeAction.name,
      mission: storeAction.missionId,
      poi: storeAction.poiUuid,
      station: storeAction.stationUuid,
      traverse: storeAction.traverseUuid,
      parentAction: storeAction.parentActionUuid,
      parentCopyDate: storeAction.parentCopyDate ? new Date(storeAction.parentCopyDate) : null,
      priority: storeAction.priority,
      stmUuidRefs: storeAction.stmUuidRefs,
      stmPriorities: storeAction.stmPriorities,
      type: storeAction.type,
      description: storeAction.description,
      stmAction: storeAction.stmAction,
      actionDefinition: storeAction.actionDefinition,
      icon: storeAction.icon,
      location: storeAction.location,
      elevation: storeAction.elevation,
      durationLower: storeAction.durationLower,
      durationUpper: storeAction.durationUpper,
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
