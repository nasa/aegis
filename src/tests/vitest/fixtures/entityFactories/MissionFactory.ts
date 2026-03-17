import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Mission_db } from "server/database/models/_allModels";
import { generateBlankMission } from "store/storeUtils/mission";

export default class MissionFactory extends Factory<Mission_db> {
  model = Mission_db;
  // use Partial in order to skip the "id" field
  definition(): Partial<EntityData<Mission_db>> {
    const mission = generateBlankMission({ name: "Vitest Mission-1" });
    delete mission.id; // remove id in order to upsert
    return mission;
  }
}
