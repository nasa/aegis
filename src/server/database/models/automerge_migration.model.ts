import { defineEntity, p } from "@mikro-orm/postgresql";

export const Automerge_Migration_dbSchema = defineEntity({
  name: "Automerge_Migration_db",
  properties: {
    version: p.bigint("number").primary().autoincrement(false),
    name: p.text().unique("automerge_migration_db_name_key"),
    completedAt: p.datetime(3).defaultRaw("now()"),
  },
});

export class Automerge_Migration_db extends Automerge_Migration_dbSchema.class {}

Automerge_Migration_dbSchema.setClass(Automerge_Migration_db);
