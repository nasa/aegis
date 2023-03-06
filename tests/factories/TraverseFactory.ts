import { Factory } from "@mikro-orm/seeder";
import { Traverse as Traverse_db } from "server/database/models/traverse.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class TraverseFactory extends Factory<Traverse_db> {
  model = Traverse_db;
  definition(): EntityData<Traverse_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      name: "Jest Traverse-1",
      path: [],
      description: "",
      durationLower: 0,
      durationUpper: 0,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
