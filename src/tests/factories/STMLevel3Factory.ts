import { Factory } from "@mikro-orm/seeder";
import { STM_Level3_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMLevel3Factory extends Factory<STM_Level3_db> {
  model = STM_Level3_db;
  definition(): EntityData<STM_Level3_db> {
    const level3: STM_Level3_db = {
      uuid: uuidv4(),
      name: "Jest STM Level3-1",
      level2: null,
      numbering: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return level3;
  }
}

export const createTestSTMLevel3 = (): STMLevel3 => {
  return {
    uuid: uuidv4(),
    name: "Jest STM Level3-1",
    level2Uuid: null,
    numbering: "1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
