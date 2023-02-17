import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Eva } from "../../models/eva.model";
import { v4 as uuidv4 } from "uuid";

export class EVASeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.eva1 = em.create(Eva, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "E-Complete",
      status: "Candidate",
      sequence: [
        { type: "station", uuid: context.station1.uuid },
        { type: "traverse", uuid: context.traverse1.uuid },
        { type: "station", uuid: context.station2.uuid },
        { type: "traverse", uuid: context.traverse2.uuid },
        { type: "station", uuid: context.station3.uuid },
        { type: "traverse", uuid: context.traverse3.uuid },
        { type: "station", uuid: context.station4.uuid },
      ],
      description: "EVA test description 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.eva2 = em.create(Eva, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "E-Empty",
      status: "Candidate",
      sequence: [],
      description: "EVA test description 2",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
