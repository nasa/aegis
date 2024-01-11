import { Migration } from "@mikro-orm/migrations";

export class Migration20240110212814 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "rex_db" add column "station_entries" jsonb null, add column "traverse_entries" jsonb null, add column "action_entries" jsonb null;'
    );
    this.addSql('alter table "rex_db" rename column "selected_rex_eva_uuid" to "eva_uuid";');
    this.addSql('alter table "rex_db" rename column "rex_running" to "is_running";');

    this.addSql('alter table "traverse_db" drop column "rex_status";');

    this.addSql('alter table "station_db" drop column "rex_status";');

    this.addSql('alter table "action_db" drop column "rex_status";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "rex_db" drop column "station_entries";');
    this.addSql('alter table "rex_db" drop column "traverse_entries";');
    this.addSql('alter table "rex_db" drop column "action_entries";');

    this.addSql('alter table "rex_db" rename column "eva_uuid" to "selected_rex_eva_uuid";');
    this.addSql('alter table "rex_db" rename column "is_running" to "rex_running";');

    this.addSql('alter table "action_db" add column "rex_status" varchar null default null;');

    this.addSql('alter table "station_db" add column "rex_status" varchar null default null;');

    this.addSql('alter table "traverse_db" add column "rex_status" varchar null default null;');
  }
}
