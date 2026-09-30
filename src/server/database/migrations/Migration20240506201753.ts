import { Migration } from "@mikro-orm/migrations";

export class Migration20240506201753 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission_db" add column "sun_enabled" boolean null default true, add column "earth_enabled" boolean null default true, add column "earth_as_moon" boolean null default false;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission_db" drop column "sun_enabled";');
    this.addSql('alter table "mission_db" drop column "earth_enabled";');
    this.addSql('alter table "mission_db" drop column "earth_as_moon";');
  }
}
