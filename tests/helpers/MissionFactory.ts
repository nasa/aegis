import { Factory } from "@mikro-orm/seeder";
import { Mission } from "../../server/database/models/mission.model";

export default class MissionFactory extends Factory<Mission> {
  model = Mission;
  definition(): Object {
    return {
      mission: "Gaia-1",
      config: {},
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}
