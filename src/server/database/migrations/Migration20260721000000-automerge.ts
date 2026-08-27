import { Migration } from "@mikro-orm/migrations";

export class Migration20260721000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "automerge_migration_db" (
        "version" bigint primary key,
        "name" text not null unique,
        "completed_at" timestamptz(3) not null default now()
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "automerge_migration_db" cascade;');
  }
}
