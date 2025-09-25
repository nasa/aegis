import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { Eva_db } from "server/database/models/_allModels";
import { convertEVAsTypeStoreToDb, generateBlankEVA } from "store/storeUtils/eva";

export default class EvaFactory extends Factory<Eva_db> {
  model = Eva_db;
  definition(): EntityData<Eva_db> {
    const eva = convertEVAsTypeStoreToDb([generateBlankEVA({ name: "Jest Eva-1" })])[0];
    return eva;
  }
}
