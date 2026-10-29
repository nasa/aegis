import { Migration } from "@mikro-orm/migrations";

export class Migration20261029000000 extends Migration {
  override up(): void {
    this.addSql(`
      create table terrain_profile_cache_db (
        mission_id integer not null,
        entity text not null,
        fingerprint text not null,
        profile jsonb not null,
        primary key (mission_id, entity),
        constraint terrain_profile_cache_db_mission_id_foreign foreign key (mission_id)
          references doc_listing_db(mission_id) on update cascade on delete cascade
      );
    `);
  }

  override down(): void {
    this.addSql(`drop table terrain_profile_cache_db;`);
  }
}
