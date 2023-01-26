import { Factory } from "@mikro-orm/seeder";
import { STM_Objective as STM_Objective_db } from "../../server/database/models/stm_objective.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMObjectiveFactory extends Factory<STM_Objective_db> {
  model = STM_Objective_db;
  definition(): EntityData<STM_Objective_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      name: "Jest STM Objective-1",
      numbering: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
