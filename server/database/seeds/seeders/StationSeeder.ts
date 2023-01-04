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
      name: "Test Station 1",
      status: "Candidate",
      description: "Test station description",
      radius: 5,
      location: {
        long: 0,
        lat: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station2 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Test Station 2",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: {
        long: 0,
        lat: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
