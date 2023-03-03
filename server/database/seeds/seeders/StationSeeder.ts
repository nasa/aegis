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
      name: "Egress",
      status: "Candidate",
      description: "Egress and activity around lander",
      radius: 5,
      location: { lat: -3.645421873728663, lng: -17.47186660766602 },
      walkbackLocation: [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        { lat: -3.655421873728663, lng: -17.48186660766602 },
      ],
      walkbackDistance: 0,
      icon: "1f680",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station2 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Snake",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: { lat: -3.6305197977566683, lng: -17.43161201477051 },
      walkbackLocation: [
        { lat: -3.6305197977566683, lng: -17.43161201477051 },
        { lat: -3.640519797756668, lng: -17.441612014770513 },
      ],
      walkbackDistance: 0,
      icon: "1f680",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station3 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Possum",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: { lat: -3.638316103462144, lng: -17.462511062622074 },
      walkbackLocation: [
        { lat: -3.638316103462144, lng: -17.462511062622074 },
        { lat: -3.648316103462144, lng: -17.472511062622074 },
      ],
      walkbackDistance: 0,
      icon: "1f680",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station4 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      name: "Ingress",
      status: "Candidate",
      description: "Cleanup and ingress",
      radius: 5,
      location: { lat: -3.645421873728663, lng: -17.47186660766602 },
      walkbackLocation: [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        { lat: -3.655421873728663, lng: -17.48186660766602 },
      ],
      walkbackDistance: 0,
      icon: "1f680",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
