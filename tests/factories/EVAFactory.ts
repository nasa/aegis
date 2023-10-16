import { Factory } from "@mikro-orm/seeder";
import { Eva_db } from "server/database/models/_allModels";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class EvaFactory extends Factory<Eva_db> {
  model = Eva_db;
  definition(): EntityData<Eva_db> {
    return {
      uuid: uuidv4(),
      owner: null,
      mission: null,
      name: "Jest Eva-1",
      status: "Candidate",
      sequence: [],
      description: "",
      maxDuration: null,
      traverseRate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export const createTestEva = (): Eva => {
  return {
    uuid: uuidv4(),
    ownerId: null,
    missionId: null,
    name: "Jest Eva-1",
    status: "Candidate",
    sequence: [],
    description: null,
    maxDuration: null,
    traverseRate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};
