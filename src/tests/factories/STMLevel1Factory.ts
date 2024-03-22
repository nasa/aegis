import { Factory } from "@mikro-orm/seeder";
import { STM_Level1_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMLevel1Factory extends Factory<STM_Level1_db> {
  model = STM_Level1_db;
  definition(): EntityData<STM_Level1_db> {
    const obj: STM_Level1_db = {
      uuid: uuidv4(),
      mission: null,
      name: "Jest STM Level1-1",
      level2s: null,
      numbering: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return obj;
  }
}

export const createTestSTMLevel1 = (): STMLevel1 => {
  return {
    uuid: uuidv4(),
    missionId: null,
    name: "Jest STM Level1-1",
    numbering: "1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
