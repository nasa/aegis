import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Poi } from "../../models/poi.model";
import { v4 as uuidv4 } from "uuid";

export class PoiSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.poi1 = em.create(Poi, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      station: [context.station1.uuid, context.station2.uuid],
      name: "P-Boa",
      description: "POI description 1",
      priorityOverride: 0,
      radius: 5,
      location: { lat: -3.645421873728663, lng: -17.47186660766602 },
      color: { value: "1F534", label: "Red" },
      tags: ["test-tag"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.poi2 = em.create(Poi, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      station: [context.station1.uuid],
      name: "P-Whale",
      description: "POI Description 2",
      priorityOverride: 0,
      radius: 5,
      location: null,
      color: { value: "1F7E2", label: "Green" },
      tags: ["Tag A", "Tag B"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
