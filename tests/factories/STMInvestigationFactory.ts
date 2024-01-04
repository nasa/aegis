import { Factory } from "@mikro-orm/seeder";
import { STM_Investigation_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMInvestigationFactory extends Factory<STM_Investigation_db> {
  model = STM_Investigation_db;
  definition(): EntityData<STM_Investigation_db> {
    const invstg: STM_Investigation_db = {
      uuid: uuidv4(),
      name: "Jest STM Investigation-1",
      goal: null,
      numbering: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return invstg;
  }
}

export const createTestSTMInvstg = (): STMInvestigation => {
  return {
    uuid: uuidv4(),
    name: "Jest STM Investigation-1",
    goalUuid: null,
    numbering: "1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
