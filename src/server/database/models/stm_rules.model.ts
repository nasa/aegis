import { defineEntity, p } from "@mikro-orm/postgresql";

export const STM_Rule_dbSchema = defineEntity({
  name: "STM_Rule_db",
  properties: {
    uuid: p.string().primary(),
    missionId: p.integer(),
    stmUuid: p.string(),
    count: p.float(),
    verbUuids: p.array<string>().columnType("text[]"),
    nounUuids: p.array<string>().columnType("text[]"),
    adjectiveUuids: p.array<string>().columnType("text[]"),
    verbAny: p.boolean(),
    nounAny: p.boolean(),
    adjectiveAny: p.boolean(),
    createdAt: p.datetime(3),
    updatedAt: p.datetime(3),
    version: p.integer().version(),
  },
});

export class STM_Rule_db extends STM_Rule_dbSchema.class implements STMRule_db_type {}

STM_Rule_dbSchema.setClass(STM_Rule_db);
