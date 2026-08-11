import { defineEntity, p } from "@mikro-orm/postgresql";

import { STM_Level1_db as STMLevel1Entity } from "./stm_level1.model";
import { STM_Level3_db as STMLevel3Entity } from "./stm_level3.model";

export const STM_Level2_dbSchema = defineEntity({
  name: "STM_Level2_db",
  properties: {
    uuid: p.string().primary(),
    level1: () => p.manyToOne(STMLevel1Entity),
    level3s: () => p.oneToMany(STMLevel3Entity).mappedBy("level2"),
    name: p.text(),
    numbering: p.string(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class STM_Level2_db extends STM_Level2_dbSchema.class implements STMLevel2_db_type {}

STM_Level2_dbSchema.setClass(STM_Level2_db);
