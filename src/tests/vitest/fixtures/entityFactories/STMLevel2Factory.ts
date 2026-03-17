import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { STM_Level2_db } from "server/database/models/_allModels";
import { convertStms2TypeStoreToDb, generateBlankStmLvl2 } from "store/storeUtils/stm";

export default class STMLevel2Factory extends Factory<STM_Level2_db> {
  model = STM_Level2_db;
  definition(): EntityData<STM_Level2_db> {
    const level2 = convertStms2TypeStoreToDb([
      generateBlankStmLvl2({ name: "Vitest STM Level2-1", numbering: "1" }),
    ])[0];
    return level2;
  }
}
