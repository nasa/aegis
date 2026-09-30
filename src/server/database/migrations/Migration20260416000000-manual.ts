import { Migration } from "@mikro-orm/migrations";

export class Migration20260416000000 extends Migration {
  override async up(): Promise<void> {
    // Create the new mission_backup_db table with missionId PK and a single JSONB data field
    this.addSql(
      `create table "mission_backup_db" ("mission_id" int not null, "data" jsonb not null, constraint "mission_backup_db_pkey" primary key ("mission_id"));`
    );

    // Drop the old mission_db table now that data has been migrated
    this.addSql(`drop table if exists "mission_db";`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mission_backup_db";`);
  }
}
