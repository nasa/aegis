import { Migration } from "@mikro-orm/migrations";

export class Migration20250428184339 extends Migration {
  override async up(): Promise<void> {
    // Enable UUID extension
    this.addSql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');

    this.addSql(
      `alter table "eva_db" add column "ref_uuid" varchar(255) not null default uuid_generate_v4();`
    );

    this.addSql(
      `alter table "station_db" add column "ref_uuid" varchar(255) not null default uuid_generate_v4();`
    );

    this.addSql(
      `alter table "traverse_db" add column "ref_uuid" varchar(255) not null default uuid_generate_v4();`
    );

    this.addSql(
      `alter table "action_db" add column "ref_uuid" varchar(255) not null default uuid_generate_v4();`
    );

    // Delete rex records with null eva_uuid before enforcing NOT NULL
    this.addSql(`DELETE FROM "rex_db" WHERE "eva_uuid" IS NULL;`);

    this.addSql(`alter table "rex_db" alter column "eva_uuid" set not null;`);

    // remove all rex folders
    this.addSql(`delete from "folder_db" where "type" = 'rex';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "action_db" drop column "ref_uuid";`);

    this.addSql(`alter table "eva_db" drop column "ref_uuid";`);

    this.addSql(`alter table "station_db" drop column "ref_uuid";`);

    this.addSql(`alter table "traverse_db" drop column "ref_uuid";`);

    this.addSql(`alter table "rex_db" alter column "eva_uuid" drop not null;`);
  }
}
