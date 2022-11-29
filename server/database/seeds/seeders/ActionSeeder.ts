import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Action } from "../../models/action.model";

export class ActionSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    em.create(Action, {
      name: "Test Action 1",
      uuid: "test-uuid1",
      poi: context.poi1.id,
      description: "Test Action description1",
      type: "observation",
      status: "Candidate",
      durationLower: 5,
      durationUpper: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(Action, {
      name: "Test Action 2",
      uuid: "test-uuid2",
      poi: context.poi1.id,
      description: "Test Action description2",
      type: "sample",
      status: "Candidate",
      durationLower: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(Action, {
      name: "Test Action 3",
      uuid: "test-uuid3",
      poi: context.poi2.id,
      description: "Test Action description3",
      type: "observation",
      status: "Candidate",
      durationLower: 5,
      durationUpper: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.create(Action, {
      name: "Test Action 4",
      uuid: "test-uuid4",
      poi: context.poi2.id,
      description: "Test Action description4",
      type: "sample",
      status: "Candidate",
      durationLower: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
