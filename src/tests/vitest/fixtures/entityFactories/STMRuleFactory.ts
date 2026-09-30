import type { EntityData } from "@mikro-orm/postgresql";

import { Factory } from "@mikro-orm/seeder";
import { v4 as uuidv4 } from "uuid";

import { STM_Rule_db } from "server/database/models/_allModels";
import { generateBlankStmRule, convertStmRulesTypeStoreToDb } from "store/storeUtils/stm";

export default class STMRuleFactory extends Factory<STM_Rule_db> {
  model = STM_Rule_db;
  definition(): EntityData<STM_Rule_db> {
    return convertStmRulesTypeStoreToDb([generateBlankStmRule({ stmUuid: uuidv4() })])[0];
  }
}
