import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Station } from "../../models/station.model";
import { v4 as uuidv4 } from "uuid";

export class StationSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.station1 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "S-Snake",
      status: "Candidate",
      description: "Test station description",
      radius: 5,
      location: { lat: -3.639175208034774, lng: -17.45710372924805 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station2 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "S-Frog",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: { lat: -3.645421873728663, lng: -17.47186660766602 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station3 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "S-Possum",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: { lat: -3.640200248844809, lng: -17.48208045959473 },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
