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
    `);
  }

  override down(): void {
    this.addSql(`
      drop table mission_eva_catalog_db;
      drop table mission_catalog_db;
      drop index doc_listing_url_idx;
    `);
  }
}
