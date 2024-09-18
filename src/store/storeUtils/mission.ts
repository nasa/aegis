import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { v4 as uuidv4 } from "uuid";
import { Mission_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";

/**
 * Generate a blank mission
 * @param partialMission any fields that are to be overriden from default
 * @returns the generated mission
 */
export const generateBlankMission = (partialMission?: Partial<Mission>): Mission => {
  const defaultNewMission: Mission = {
    id: null,
    version: 0,
    name: "",
    description: "",
    missionBanner: "",
    landerLocation: null,
    landerElevationMeters: 0,
    traverseRate: 2,
    defaultEvaDuration: 240,
    walkbackRate: 2,
    equipmentItems: [],
    geographicUnits: [],
    planetRadius: 1737400, // moon
    initialZoom: 14,
    demFilePath: "",
    demResolution: 0,
    projIsCustom: false,
    projEpsg: "",
    projProj4String: "",
    projBoundsMinX: 0,
    projBoundsMinY: 0,
    projBoundsMaxX: 0,
    projBoundsMaxY: 0,
    projOriginX: 0,
    projOriginY: 0,
    projResZoomLevel: 0,
    projResUnitsPerPixel: 0,
    landerRadii: [],
    actionTemplates: null,
    stmLevel1Enabled: true,
    stmLevel1Name: "Goal",
    stmLevel2Name: "Objective",
    stmLevel3Name: "Investigation",
    updatedAt: roundDateToSecond(new Date()).toISOString(),
    createdAt: roundDateToSecond(new Date()).toISOString(),
  };
  return { ...defaultNewMission, ...partialMission };
};

/**
 * Generate a blank action template
 * @param partialActionTemplate any fields that are to be overriden from default
 * @returns the generated action template
 */
export const generateBlankActionTemplate = (
  partialActionTemplate?: Partial<ActionTemplate>
): ActionTemplate => {
  const defaultNewActionTemplate: ActionTemplate = {
    uuid: uuidv4(),
    templateName: null,
    missionId: null,
    name: "",
    description: "",
    status: "Candidate",
    type: "other",
    durationLower: 5,
    durationUpper: 6,
    stmUuidRefs: null,
    stmPriorities: null,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    crewAssigned: [],
    mass: null,
    priority: null,
    createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  return { ...defaultNewActionTemplate, ...partialActionTemplate };
};

/**
 * Converts db mission fks to their uuid/id arrays
 * @param dbMissions an array of missions in mikro db format
 * @returns an a converted array of missions or a single mission
 */
export function convertMissionsTypeDbToStore(dbMissions: Mission_db[]): Mission[] {
  const missions: Mission[] = [];
  for (const dbMission of dbMissions) {
    const convertedMission: Mission = {
      ...dbMission,
      updatedAt: dbMission.updatedAt.toISOString(),
      createdAt: dbMission.createdAt.toISOString(),
    };
    missions.push(convertedMission);
  }
  return missions;
}

/**
 * Converts missions that come from the store into the db type
 * @param storeMissions
 * @returns
 */
export function convertMissionsTypeStoreToDb(storeMissions: Mission[]): EntityData<Mission_db>[] {
  const dbMissions: EntityData<Mission_db>[] = [];
  for (const storeMission of storeMissions) {
    const convertedRecord: EntityData<Mission_db> = {
      ...storeMission,
      updatedAt: new Date(storeMission.updatedAt),
      createdAt: new Date(storeMission.createdAt),
    };
    dbMissions.push(convertedRecord);
  }
  return dbMissions;
}
