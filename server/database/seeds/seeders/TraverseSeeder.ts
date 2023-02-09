import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Traverse } from "../../models/traverse.model";
import { v4 as uuidv4 } from "uuid";

export class TraverseSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.traverse1 = em.create(Traverse, {
      uuid: uuidv4(),
      mission: context.mission1.id,
      name: "T-Running",
      location: [
        { lat: -3.639175208034774, lng: -17.45710372924805 },
        { lat: -3.645421873728663, lng: -17.47186660766602 },
      ],
      description: "Traverse description 1",
      duration: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.traverse2 = em.create(Traverse, {
      uuid: uuidv4(),
      mission: context.mission1.id,
      name: "T-Walking",
      location: [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        { lat: -3.640200248844809, lng: -17.48208045959473 },
      ],
      description: "Traverse description 2",
      duration: 70,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
