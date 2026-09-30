import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { STM_Level1_db } from "server/database/models/_allModels";
import { convertStms1TypeStoreToDb, generateBlankStmLvl1 } from "store/storeUtils/stm";

export default class STMLevel1Factory extends Factory<STM_Level1_db> {
  model = STM_Level1_db;
  definition(): EntityData<STM_Level1_db> {
    const obj = convertStms1TypeStoreToDb([
      generateBlankStmLvl1({ name: "Vitest STM Level1-1", numbering: "1" }),
    ])[0];
    return obj;
  }
}
