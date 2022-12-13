import { Factory } from "@mikro-orm/seeder";
import { Mission as Mission_db } from "../../server/database/models/mission.model";

export default class MissionFactory extends Factory<Mission_db> {
  model = Mission_db;
  definition(): Object {
    return {
      name: "Gaia-1",
      config: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
