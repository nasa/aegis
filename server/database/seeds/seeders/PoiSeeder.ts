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
      station: [context.station1.uuid],
      name: "Walrus",
      description: "Near lander point of interest",
      priorityOverride: 0,
      radius: 5,
      location: { lat: -3.6464986139631916, lng: -17.47185587882996 },
      icon: "1F534",
      tags: ["test-tag"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.poi2 = em.create(Poi, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      station: [context.station2.uuid],
      name: "Whale",
      description: "POI NE of lander",
      priorityOverride: 0,
      radius: 5,
      location: { lat: -3.6303469014208716, lng: -17.432727813720707 },
      icon: "1F7E2",
      tags: ["Tag A", "Tag B"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.poi3 = em.create(Poi, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      station: [context.station1.uuid],
      name: "Fish",
      description: "POI With no location yet set",
      priorityOverride: 0,
      radius: 5,
      location: null,
      icon: "1F7E1",
      tags: ["Tag A", "Tag B"],
      status: "Candidate",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
