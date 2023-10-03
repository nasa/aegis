import { Factory } from "@mikro-orm/seeder";
import { Traverse as Traverse_db } from "server/database/models/traverse.model";
import { v4 as uuidv4 } from "uuid";
import { EntityData } from "@mikro-orm/core";

export default class TraverseFactory extends Factory<Traverse_db> {
  model = Traverse_db;
  definition(): EntityData<Traverse_db> {
    return {
      uuid: uuidv4(),
      mission: null,
      name: "Jest Traverse-1",
      path: [],
      description: "",
      predictedDurationLower: 0,
      predictedDurationUpper: 0,
      status: "Candidate",
      rexStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

export const createTestTraverse = (): Traverse => {
  return {
    uuid: uuidv4(),
    missionId: null,
    name: "Jest Traverse-1",
    status: "Candidate",
    path: null,
    pathSegmentDistances: null,
    pathSegmentElevations: null,
    predictedDurationLower: 0,
    predictedDurationUpper: 0,
    description: "",
    traverseRate: null,
    rexStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  };
};
