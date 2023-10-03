import { EntityData } from "@mikro-orm/core";
import { Factory } from "@mikro-orm/seeder";
import { Mission as Mission_db } from "server/database/models/mission.model";

export default class MissionFactory extends Factory<Mission_db> {
  model = Mission_db;
  definition(): EntityData<Mission_db> {
    return {
      name: "Jest Mission-1",
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
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
    sunAzimuthVisible: null,
    earthAzimuthVisible: null,
    defaultEvaDuration: null,
    walkbackRate: null,
    equipmentItems: null,
    geographicUnits: null,
    _metadata: null,
    demFilePath: null,
    demResolution: null,
    projIsCustom: null,
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
