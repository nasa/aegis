import { defineEntity, p } from "@mikro-orm/postgresql";

import { STM_Level2_db as STMLevel2Entity } from "./stm_level2.model";

export const STM_Level3_dbSchema = defineEntity({
  name: "STM_Level3_db",
  properties: {
    uuid: p.string().primary(),
    level2: () => p.manyToOne(STMLevel2Entity),
    name: p.text(),
    numbering: p.string(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class STM_Level3_db extends STM_Level3_dbSchema.class implements STMLevel3_db_type {}

STM_Level3_dbSchema.setClass(STM_Level3_db);
