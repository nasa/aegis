import { Migration } from "@mikro-orm/migrations";

export class Migration20260603000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "environment_config_db" ("id" serial primary key, "url_override" varchar(255) null, "version" int not null default 1);`
    );
    // Seed the single config row so GET never returns empty
    this.addSql(
      `insert into "environment_config_db" ("id", "url_override", "version") values (1, null, 1);`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "environment_config_db";`);
  }
}
