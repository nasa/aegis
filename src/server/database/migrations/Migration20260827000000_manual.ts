import { Migration } from "@mikro-orm/migrations";

/**
 * Drop the mission backup table.
 *
 * Missions live exclusively in the Automerge document store, which persists to
 * `automerge_native_db`. The JSONB copy in `mission_backup_db` was written on every
 * document change and is no longer maintained, so the table is removed.
 */
export class Migration20260827000000_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`drop table if exists "mission_backup_db";`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `create table "mission_backup_db" ("mission_id" int not null, "data" jsonb not null, constraint "mission_backup_db_pkey" primary key ("mission_id"));`
    );
  }
}
