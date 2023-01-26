import { Factory } from "@mikro-orm/seeder";
import { STM_Investigation as STM_Investigation_db } from "../../server/database/models/stm_investigation.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMInvestigationFactory extends Factory<STM_Investigation_db> {
  model = STM_Investigation_db;
  definition(): EntityData<STM_Investigation_db> {
    return {
      uuid: uuidv4(),
      name: "Jest STM Investigation-1",
      numbering: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
