import { Factory } from "@mikro-orm/seeder";
import { Station_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class StationFactory extends Factory<Station_db> {
  model = Station_db;
  definition(): EntityData<Station_db> {
    return {
      uuid: uuidv4(),
      owner: null,
      mission: null,
      poi: null,
      actionOrderUuids: null,
      name: "Jest Station-1",
      status: "Candidate",
      description: "",
      radius: 0,
      location: null,
      elevation: null,
      walkbackPath: null,
      walkbackPathSegmentDistances: null,
      walkbackPathSegmentElevations: null,
      durationLower: null,
      durationUpper: null,
      rexStatus: null,
      icon: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export const createTestStation = (): Station => {
  return {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    poiUuids: null,
    actionOrderUuids: null,
    name: "Jest Station-1",
    status: "Candidate",
    description: "",
    radius: 0,
    location: null,
    elevation: null,
    walkbackPath: null,
    walkbackPathSegmentDistances: null,
    walkbackPathSegmentElevations: null,
    icon: null,
    durationLower: null,
    durationUpper: null,
    rexStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};
