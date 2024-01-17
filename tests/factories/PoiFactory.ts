import { Factory } from "@mikro-orm/seeder";
import { Poi_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class PoiFactory extends Factory<Poi_db> {
  model = Poi_db;
  definition(): EntityData<Poi_db> {
    const poi: Poi_db = {
      uuid: uuidv4(),
      mission: null,
      owner: null,
      station: null,
      name: "Jest Poi-1",
      description: "",
      actionOrderUuids: [],
      priorityOverride: null,
      radius: 0,
      location: null,
      elevation: null,
      icon: null,
      tags: null,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return poi;
  }
}

export const createTestPoi = (): POI => {
  return {
    uuid: uuidv4(),
    missionId: null,
    ownerId: null,
    name: "Jest Poi-1",
    description: "",
    actionOrderUuids: [],
    priorityOverride: null,
    radius: 0,
    location: null,
    elevation: null,
    icon: null,
    tags: null,
    status: "Candidate",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};
