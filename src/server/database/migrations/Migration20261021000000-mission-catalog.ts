import { Migration } from "@mikro-orm/migrations";

export class Migration20261021000000 extends Migration {
  override up(): void {
    this.addSql(`
      create index doc_listing_url_idx on doc_listing_db(automerge_url);
      create table mission_catalog_db (
        mission_id integer primary key,
        summary jsonb not null,
        projection_version integer not null,
        constraint mission_catalog_db_mission_id_foreign foreign key (mission_id)
          references doc_listing_db(mission_id) on update cascade on delete cascade
      );
      create table mission_eva_catalog_db (
        mission_id integer not null,
        eva_uuid text not null,
        name text not null,
        is_as_planned boolean not null,
        primary key (mission_id, eva_uuid),
        constraint mission_eva_catalog_db_mission_id_foreign foreign key (mission_id)
          references mission_catalog_db(mission_id) on delete cascade
      );
      create index mission_eva_catalog_uuid_idx on mission_eva_catalog_db(eva_uuid);
      create table mission_catalog_pending_db (
        document_id text primary key,
        generation uuid not null default gen_random_uuid()
      );
      create function automerge_native_db_mission_catalog_storage_fn() returns trigger language plpgsql as $$
      begin
        if (TG_OP = 'INSERT' or NEW.value is distinct from OLD.value)
          and NEW.key[2] in (convert_to('snapshot', 'UTF8'), convert_to('incremental', 'UTF8')) then
          insert into mission_catalog_pending_db(document_id)
          values (convert_from(NEW.key[1], 'UTF8'))
          on conflict (document_id) do update set generation = gen_random_uuid();
        end if;
        return NEW;
      end;
      $$;
      create trigger mission_catalog_storage after insert or update on automerge_native_db
        for each row execute function automerge_native_db_mission_catalog_storage_fn();
    `);
  }

  override down(): void {
    this.addSql(`
      drop trigger mission_catalog_storage on automerge_native_db;
      drop function automerge_native_db_mission_catalog_storage_fn();
      drop table mission_eva_catalog_db;
      drop table mission_catalog_db;
      drop table mission_catalog_pending_db;
      drop index doc_listing_url_idx;
    `);
  }
}
