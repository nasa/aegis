import { defineEntity, p } from "@mikro-orm/postgresql";

export const Automerge_Native_dbSchema = defineEntity({
  name: "Automerge_Native_db",
  properties: {
    key: p.array<Uint8Array>().columnType("bytea[]").primary(),
    value: p.uint8array(),
  },
});

export class Automerge_Native_db extends Automerge_Native_dbSchema.class {}

Automerge_Native_dbSchema.setClass(Automerge_Native_db);
