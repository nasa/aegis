import { Factory } from "@mikro-orm/seeder";
import { STM_Goal as STM_Goal_db } from "server/database/models/stm_goal.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMGoalFactory extends Factory<STM_Goal_db> {
  model = STM_Goal_db;
  definition(): EntityData<STM_Goal_db> {
    return {
      uuid: uuidv4(),
      name: "Jest STM-1",
      numbering: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
