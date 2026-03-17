import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";
import { v4 as uuidv4 } from "uuid";

import { Rex_db } from "server/database/models/_allModels";
import { convertRexesTypeStoreToDb, generateBlankRex } from "store/storeUtils/rex";

export default class RexFactory extends Factory<Rex_db> {
  model = Rex_db;
  definition(): EntityData<Rex_db> {
    const rex = convertRexesTypeStoreToDb([
      generateBlankRex({ evaUuid: uuidv4(), name: "Vitest Rex-1" }),
    ])[0];
    return rex;
  }
}
