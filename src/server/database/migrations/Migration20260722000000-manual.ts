import { Migration } from "@mikro-orm/migrations";

/**
 * Drop the grid_db table. Grid metadata now lives on the mission Automerge doc
 * (`mission.grid`) and the coordinate array remains as an on-disk file in the
 * mission's Data/ folder. See the Automerge grid migration for the data move.
 */
export class Migration20260722000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql('drop table if exists "grid_db" cascade;');
  }

  override async down(): Promise<void> {
    // Best-effort recreation (the original mission_db foreign key is not restored
    // because mission_db was removed by the Automerge migration).
    this.addSql(
      'create table "grid_db" ("uuid" varchar(255) not null, "mission_id" int null, "num_rows" int null, "num_cols" int null, "spacing" int null, "name" text null, "file_name" text null, "is_active_grid" boolean null, "version" int not null default 1, constraint "grid_db_pkey" primary key ("uuid"));'
    );
  }
}
