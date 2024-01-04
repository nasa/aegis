import { Factory } from "@mikro-orm/seeder";
import { Station_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class StationFactory extends Factory<Station_db> {
  model = Station_db;
  definition(): EntityData<Station_db> {
    const station: Station_db = {
      uuid: uuidv4(),
      owner: null,
      mission: null,
      poi: null,
      action: null,
      actionOrderUuids: [],
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return station;
  }
}

export const createTestStation = (): Station => {
  return {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    poiUuids: null,
    actionOrderUuids: [],
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
