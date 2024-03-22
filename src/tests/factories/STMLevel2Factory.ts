import { Factory } from "@mikro-orm/seeder";
import { STM_Level2_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMLevel2Factory extends Factory<STM_Level2_db> {
  model = STM_Level2_db;
  definition(): EntityData<STM_Level2_db> {
    const level2: STM_Level2_db = {
      uuid: uuidv4(),
      name: "Jest STM-1",
      numbering: "1",
      level1: null,
      level3s: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return level2;
  }
}

export const createTestSTMLevel2 = (): STMLevel2 => {
  return {
    uuid: uuidv4(),
    level1Uuid: null,
    name: "Jest STM-1",
    numbering: "1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
