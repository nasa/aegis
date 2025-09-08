import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";

import { STM_Level3_db } from "server/database/models/_allModels";
import { convertStms3TypeStoreToDb, generateBlankStmLvl3 } from "store/storeUtils/stm";

export default class STMLevel3Factory extends Factory<STM_Level3_db> {
  model = STM_Level3_db;
  definition(): EntityData<STM_Level3_db> {
    const level3 = convertStms3TypeStoreToDb([
      generateBlankStmLvl3({ name: "Jest STM Level3-1", numbering: "1" }),
    ])[0];
    return level3;
  }
}
