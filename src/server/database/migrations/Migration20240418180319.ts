import { Migration } from "@mikro-orm/migrations";

export class Migration20240418180319 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission_db" drop column "sun_azimuth_visible";');
    this.addSql('alter table "mission_db" drop column "earth_azimuth_visible";');
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "mission_db" add column "sun_azimuth_visible" bool not null default false, add column "earth_azimuth_visible" bool not null default false;'
    );
  }
}
