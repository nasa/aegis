import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Action } from "../../models/action.model";
import { v4 as uuidv4 } from "uuid";

export class ActionSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.action1 = em.create(Action, {
      name: "Test Action 1",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: context.poi1.uuid,
      description: "Test Action description1",
      type: "observation",
      status: "Candidate",
      durationLower: 5,
      durationUpper: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.action2 = em.create(Action, {
      name: "Test Action 2",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: context.poi1.uuid,
      description: "Test Action description2",
      type: "sample",
      status: "Candidate",
      durationLower: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.action3 = em.create(Action, {
      name: "Test Action 3",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: context.poi2.uuid,
      station: null,
      description: "Test Action description3",
      type: "observation",
      status: "Candidate",
      durationLower: 5,
      durationUpper: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.action4 = em.create(Action, {
      name: "Test Action 4",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: context.poi2.uuid,
      station: null,
      description: "Test Action description4",
      type: "sample",
      status: "Candidate",
      durationLower: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.action5 = em.create(Action, {
      name: "Test Action 5",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: null,
      station: context.station2.uuid,
      stmUuidRefs: [context.uuid_invstg1.uuid, context.uuid_invstg5.uuid],
      description: "Test Action description5",
      type: "observation",
      status: "Candidate",
      durationLower: 2,
      durationUpper: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.action6 = em.create(Action, {
      name: "Test Action 6",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: null,
      station: context.station2.uuid,
      stmUuidRefs: [context.uuid_invstg2.uuid, context.uuid_invstg6.uuid],
      description: "Test Action description6",
      type: "photo",
      status: "In Review",
      durationLower: 2,
      durationUpper: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.action7 = em.create(Action, {
      name: "Test Action 7",
      uuid: uuidv4(),
      mission: context.mission1.id,
      poi: null,
      station: context.station2.uuid,
      stmUuidRefs: [context.uuid_invstg2.uuid, context.uuid_invstg4.uuid],
      description: "Test Action description6",
      type: "measurement",
      status: "Approved",
      durationLower: 2,
      durationUpper: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
