import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Poi } from "../../models/poi.model";

export class PoiSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.poi1 = em.create(Poi, {
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Test POI 1",
      description: "Test POI description",
      priorityOverride: 0,
      radius: 5,
      uuid: "test-uuid",
      location: {
        long: 0,
        lat: 0,
      },
      color: { value: "#ff0000", label: "Red" },
      tags: ["test-tag"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.poi2 = em.create(Poi, {
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "POI Name 2",
      description: "POI Description 2",
      priorityOverride: 0,
      radius: 5,
      uuid: "test-uuid-2",
      location: {
        long: 0,
        lat: 0,
      },
      color: { value: "#00ff00", label: "Green" },
      tags: ["Tag A", "Tag B"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
