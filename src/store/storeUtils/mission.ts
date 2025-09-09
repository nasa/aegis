import { getAccurateNow } from "utils/formatting";
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
    isArchived: false,
    usingLGRSCoordinates: false,
    description: "",
    actionSystemVersion: 1,
    actionDefinitions: null,
    missionBanner: "",
    landerLocation: null,
    landerElevationMeters: 0,
    traverseRate: 2,
    defaultEvaDuration: 240,
    walkbackRate: 2,
    equipmentItems: [],
    geographicUnits: [],
    activeGridUuid: null,
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
    circleDefinitions: [],
    actionTemplates: null,
    stmLevel1Enabled: true,
    stmLevel1Name: "Goal",
    stmLevel2Name: "Objective",
    stmLevel3Name: "Investigation",
    updatedAt: getAccurateNow().toISOString(),
    createdAt: getAccurateNow().toISOString(),
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
    duration: 6,
    stmAction: false,
    stmUuidRefs: null,
    stmPriorities: null,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    crewAssigned: [],
    mass: null,
    priority: null,
    createdAt: getAccurateNow().toISOString(),
    updatedAt: getAccurateNow().toISOString(),
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

export const generateDefaultActionDefinitions = (
  partialActionDefinitions?: Partial<ActionDefinitions>
): ActionDefinitions => {
  const newActionDefinitions = {
    verbs: [
      { uuid: uuidv4(), name: "Characterize", abbr: "charize" },
      { uuid: uuidv4(), name: "Describe", abbr: "describe" }, // same as "characterize"?
      { uuid: uuidv4(), name: "Deploy", abbr: "deploy" },
      { uuid: uuidv4(), name: "Measure", abbr: "measure" },
      { uuid: uuidv4(), name: "Observe", abbr: "observe" },
      { uuid: uuidv4(), name: "Photo", abbr: "photo" },
      { uuid: uuidv4(), name: "Photo: 360 Panorama", abbr: "p-pano" },
      { uuid: uuidv4(), name: "Photo: Mosaic", abbr: "p-mosaic" },
      { uuid: uuidv4(), name: "Photo: Nested Image", abbr: "p-nested" },
      { uuid: uuidv4(), name: "Photo: Photometric Survey", abbr: "p-survey" },
      { uuid: uuidv4(), name: "Photo: Stereo Mosaic", abbr: "p-stermosc" },
      { uuid: uuidv4(), name: "Photo: Stereo Pair", abbr: "p-stereo" },
      { uuid: uuidv4(), name: "Place", abbr: "place" },
      { uuid: uuidv4(), name: "Sample: Chip", abbr: "s-chip" },
      { uuid: uuidv4(), name: "Sample: Double Drive Tube", abbr: "s-ddtube" },
      { uuid: uuidv4(), name: "Sample: Drive Tube", abbr: "s-dtube" },
      { uuid: uuidv4(), name: "Sample: Float", abbr: "s-float" },
      { uuid: uuidv4(), name: "Sample: Rake", abbr: "s-rake" },
      { uuid: uuidv4(), name: "Sample: Scoop", abbr: "s-scoop" },
      { uuid: uuidv4(), name: "Sample: Sealed Scoop", abbr: "s-sscoop" },
      { uuid: uuidv4(), name: "Sample: Skim", abbr: "s-skim" },
      { uuid: uuidv4(), name: "Sample: Sealed Skim", abbr: "s-sskim" },
      { uuid: uuidv4(), name: "Sample: Sealed Drive Tube", abbr: "s-sdtube" },
      { uuid: uuidv4(), name: "Sample: Sealed Double Drive Tube", abbr: "s-sddtube" },
      { uuid: uuidv4(), name: "Sample: Contact Sample", abbr: "s-contact" },
      { uuid: uuidv4(), name: "Trench", abbr: "trench" },
    ],

    nouns: [
      { uuid: uuidv4(), name: "Boulder", abbr: "boulder" },
      { uuid: uuidv4(), name: "Boulder Fillet", abbr: "boulderfillet" },
      { uuid: uuidv4(), name: "Contact", abbr: "contact" },
      { uuid: uuidv4(), name: "Crater Floor", abbr: "craterflr" },
      { uuid: uuidv4(), name: "Crater Rim", abbr: "craterrim" },
      { uuid: uuidv4(), name: "Geotechnical Properties", abbr: "geoprops" },
      { uuid: uuidv4(), name: "Impact Melt", abbr: "impactmelt" },
      { uuid: uuidv4(), name: "Regolith (any)", abbr: "regolith" },
      { uuid: uuidv4(), name: "Regolith (Disturbed)", abbr: "regdist" },
      { uuid: uuidv4(), name: "Regolith (Undisturbed)", abbr: "regundist" },
      { uuid: uuidv4(), name: "Station", abbr: "station" },
      { uuid: uuidv4(), name: "Trench (any)", abbr: "trench" },
      { uuid: uuidv4(), name: "Trench Floor", abbr: "trenchflr" },
      { uuid: uuidv4(), name: "Trench Wall", abbr: "trenchwall" },
    ],

    adjectives: [
      { uuid: uuidv4(), name: "Distal to Lander", abbr: "distalnder" },
      { uuid: uuidv4(), name: "Proximal to Lander", abbr: "proxlander" },
      { uuid: uuidv4(), name: "PSR", abbr: "psr" },
      { uuid: uuidv4(), name: "Shadow", abbr: "shadow" },
      { uuid: uuidv4(), name: "Terrain Type: cb", abbr: "cb" },
      { uuid: uuidv4(), name: "Terrain Type: ce", abbr: "ce" },
      { uuid: uuidv4(), name: "Terrain Type: icwf", abbr: "icwf" },
      { uuid: uuidv4(), name: "Terrain Type: icwd", abbr: "icwd" },
      { uuid: uuidv4(), name: "Terrain Type: uh1", abbr: "uh1" },
      { uuid: uuidv4(), name: "Terrain Type: uh2", abbr: "uh2" },
      { uuid: uuidv4(), name: "Geo Unit: A", abbr: "A" },
      { uuid: uuidv4(), name: "Geo Unit: B", abbr: "B" },
      { uuid: uuidv4(), name: "Geo Unit: C", abbr: "C" },
    ],
  };

  return { ...newActionDefinitions, ...partialActionDefinitions };
};
