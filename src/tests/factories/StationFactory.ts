import { Factory } from "@mikro-orm/seeder";
import { Station_db } from "server/database/models/_allModels";
import { EntityData } from "@mikro-orm/core";
import { convertStationsTypeStoreToDb, generateBlankStation } from "store/storeUtils/station";

export default class StationFactory extends Factory<Station_db> {
  model = Station_db;
  definition(): EntityData<Station_db> {
    const station = convertStationsTypeStoreToDb([
      generateBlankStation({
        name: "Jest Test Station",
      }),
    ])[0];
    return station;
  }
}
