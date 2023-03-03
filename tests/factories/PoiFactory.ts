import { Factory } from "@mikro-orm/seeder";
import { Poi as Poi_db } from "../../server/database/models/poi.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class PoiFactory extends Factory<Poi_db> {
  model = Poi_db;
  definition(): EntityData<Poi_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      owner: null,
      name: "Jest Poi-1",
      description: "",
      priorityOverride: null,
      radius: 0,
      location: null,
      icon: null,
      tags: null,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
