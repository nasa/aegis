import { defineEntity, p } from "@mikro-orm/postgresql";

import { STM_Level2_db as STMLevel2Entity } from "./stm_level2.model";

export const STM_Level1_dbSchema = defineEntity({
  name: "STM_Level1_db",
  properties: {
    uuid: p.string().primary(),
    missionId: p.integer(),
    level2s: () => p.oneToMany(STMLevel2Entity).mappedBy("level1"),
    name: p.text(),
    numbering: p.string(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class STM_Level1_db extends STM_Level1_dbSchema.class implements STMLevel1_db_type {}

STM_Level1_dbSchema.setClass(STM_Level1_db);
