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
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        { lat: -3.6305197977566683, lng: -17.43161201477051 },
      ],
      distance: 1299.3051480173328,
      description: "Traverse description 1",
      durationLower: 30,
      durationUpper: 40,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.traverse2 = em.create(Traverse, {
      uuid: uuidv4(),
      mission: context.mission1.id,
      name: "T-Walking",
      location: [
        { lat: -3.6305197977566683, lng: -17.43161201477051 },
        { lat: -3.638316103462144, lng: -17.462511062622074 },
      ],
      distance: 964.500440114797,
      description: "Traverse description 2",
      durationLower: 20,
      durationUpper: 25,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.traverse3 = em.create(Traverse, {
      uuid: uuidv4(),
      mission: context.mission1.id,
      name: "T-Skipping",
      location: [
        { lat: -3.638316103462144, lng: -17.462511062622074 },
        { lat: -3.645421873728663, lng: -17.47186660766602 },
      ],
      distance: 355.78614116138584,
      description: "Traverse description 3",
      durationLower: 20,
      durationUpper: 25,
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
