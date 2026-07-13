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
    createdAt: getAccurateNow().getTime(),
    updatedAt: getAccurateNow().getTime(),
  };
  return { ...defaultNewAction, ...partialAction };
};

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
