import { Factory } from "@mikro-orm/seeder";
import { Action as Action_db } from "server/database/models/action.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class ActionFactory extends Factory<Action_db> {
  model = Action_db;
  definition(): EntityData<Action_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      poi: null,
      station: null,
      name: "Jest Action-1",
      type: "measurement",
      description: "",
      durationLower: 0,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
