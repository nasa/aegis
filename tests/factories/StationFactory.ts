import { Factory } from "@mikro-orm/seeder";
import { Station as Station_db } from "../../server/database/models/station.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class StationFactory extends Factory<Station_db> {
  model = Station_db;
  definition(): EntityData<Station_db> {
    return {
      uuid: uuidv4(),
      owner: null,
      mission: null,
      name: "Jest Station-1",
      status: "Candidate",
      description: "",
      radius: 0,
      location: null,
      walkbackLocation: null,
      walkbackDistance: 0,
      durationLower: 0,
      durationUpper: 0,
      icon: null,

      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
