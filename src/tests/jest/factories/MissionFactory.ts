import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Mission_db } from "server/database/models/_allModels";
import { convertMissionsTypeStoreToDb, generateBlankMission } from "store/storeUtils/mission";

export default class MissionFactory extends Factory<Mission_db> {
  model = Mission_db;
  // use Partial in order to skip the "id" field
  definition(): Partial<EntityData<Mission_db>> {
    const storeMission = generateBlankMission({ name: "Jest Mission-1" });
    delete storeMission.id; // remove id in order to upsert
    const mission = convertMissionsTypeStoreToDb([storeMission])[0];
    return mission;
  }
}
