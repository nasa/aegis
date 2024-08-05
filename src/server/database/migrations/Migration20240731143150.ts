import { Migration } from "@mikro-orm/migrations";

export class Migration20240731143150 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission_db" add column "stm_level1name" text null default \'Goal\', add column "stm_level2name" text null default \'Objective\', add column "stm_level3name" text null default \'Investigation\', add column "stm_level1enabled" boolean not null default true;'
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "mission_db" drop column "stm_level1name", drop column "stm_level2name", drop column "stm_level3name", drop column "stm_level1enabled";'
    );
  }
}
