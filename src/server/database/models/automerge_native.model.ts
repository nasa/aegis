import { defineEntity, p } from "@mikro-orm/postgresql";

export const Automerge_Native_dbSchema = defineEntity({
  name: "Automerge_Native_db",
  // Keep this declaration in sync with the catalog migration so schema diff generation
  // preserves the durable invalidation trigger. This also covers standalone document writers.
  triggers: [
    {
      name: "mission_catalog_storage",
      timing: "after",
      events: ["insert", "update"],
      body: `
      if (TG_OP = 'INSERT' or NEW.value is distinct from OLD.value)
        and NEW.key[2] in (convert_to('snapshot', 'UTF8'), convert_to('incremental', 'UTF8')) then
        insert into mission_catalog_pending_db(document_id)
        values (convert_from(NEW.key[1], 'UTF8'))
        on conflict (document_id) do update set generation = gen_random_uuid();
      end if;
      return NEW;
    `,
    },
  ],
  properties: {
    key: p.array<Uint8Array>().columnType("bytea[]").primary(),
    value: p.uint8array(),
  },
});

export class Automerge_Native_db extends Automerge_Native_dbSchema.class {}

Automerge_Native_dbSchema.setClass(Automerge_Native_db);
