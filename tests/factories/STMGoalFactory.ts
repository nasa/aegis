import { Factory } from "@mikro-orm/seeder";
import { STM_Goal_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class STMGoalFactory extends Factory<STM_Goal_db> {
  model = STM_Goal_db;
  definition(): EntityData<STM_Goal_db> {
    const goal: STM_Goal_db = {
      uuid: uuidv4(),
      name: "Jest STM-1",
      numbering: "1",
      objective: null,
      investigations: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return goal;
  }
}

export const createTestSTMGoal = (): STMGoal => {
  return {
    uuid: uuidv4(),
    objectiveUuid: null,
    name: "Jest STM-1",
    numbering: "1",
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
