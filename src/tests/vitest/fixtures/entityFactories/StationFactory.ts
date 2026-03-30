import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Station_db } from "server/database/models/_allModels";
import { convertStationsTypeStoreToDb, generateBlankStation } from "store/storeUtils/station";

export default class StationFactory extends Factory<Station_db> {
  model = Station_db;
  definition(): EntityData<Station_db> {
    const station = convertStationsTypeStoreToDb([
      generateBlankStation({
        name: "Vitest Test Station",
      }),
    ])[0];
    return station;
  }
}
