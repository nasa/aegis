import { Factory } from "@mikro-orm/seeder";
import { Mission_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";

export default class MissionFactory extends Factory<Mission_db> {
  model = Mission_db;
  // use Partial in order to skip the "id" field
  definition(): Partial<Mission_db> {
    const mission: Partial<Mission_db> = {
      name: "Jest Mission-1",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      missionBanner: null,
      landerLocation: null,
      landerElevationMeters: null,
      planetRadius: null,
      initialZoom: null,
      traverseRate: null,
      sunAzimuth: null,
      earthAzimuth: null,
      sunAzimuthVisible: false,
      earthAzimuthVisible: false,
      defaultEvaDuration: null,
      walkbackRate: null,
      equipmentItems: null,
      geographicUnits: null,
      demFilePath: null,
      demResolution: null,
      projIsCustom: false,
      projEpsg: null,
      projProj4String: null,
      projBoundsMinX: null,
      projBoundsMinY: null,
      projBoundsMaxX: null,
      projBoundsMaxY: null,
      projOriginX: null,
      projOriginY: null,
      projResZoomLevel: null,
      projResUnitsPerPixel: null,
      landerRadii: null,
      actionTemplates: null,
    };
    return mission;
  }
}

export const createTestMission = (): Mission => {
  return {
    id: null,
    name: "Jest Mission-1",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description: null,
    missionBanner: null,
    landerLocation: null,
    landerElevationMeters: null,
    planetRadius: null,
    initialZoom: null,
    traverseRate: null,
    sunAzimuth: null,
    earthAzimuth: null,
    sunAzimuthVisible: false,
    earthAzimuthVisible: false,
    defaultEvaDuration: null,
    walkbackRate: null,
    equipmentItems: null,
    geographicUnits: null,
    demFilePath: null,
    demResolution: null,
    projIsCustom: false,
    projEpsg: null,
    projProj4String: null,
    projBoundsMinX: null,
    projBoundsMinY: null,
    projBoundsMaxX: null,
    projBoundsMaxY: null,
    projOriginX: null,
    projOriginY: null,
    projResZoomLevel: null,
    projResUnitsPerPixel: null,
    landerRadii: null,
    actionTemplates: null,
  };
};

export const createTestActionTemplate = (): ActionTemplate => {
  return {
    templateName: "Jest Action Template",
    missionId: null,
    uuid: uuidv4(),
    name: "",
    description: "",
    status: "Candidate",
    type: "other",
    durationLower: null,
    durationUpper: null,
    stmUuidRefs: null,
    stmPriorities: null,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    crewAssigned: [],
    mass: null,
    priority: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
