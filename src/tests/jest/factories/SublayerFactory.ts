import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Sublayer_db } from "server/database/models/_allModels";
import { convertSublayersTypeStoreToDb, generateBlankSublayer } from "store/storeUtils/sublayer";

export default class SublayerFactory extends Factory<Sublayer_db> {
  model = Sublayer_db;
  definition(): EntityData<Sublayer_db> {
    const sublayer = convertSublayersTypeStoreToDb([
      generateBlankSublayer({ name: "Jest Test Sublayer" }),
    ])[0];
    return sublayer;
  }
}
