import { Migration } from "@mikro-orm/migrations";

export class Migration20240918205443 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "mission_db" drop column "sun_azimuth", drop column "earth_azimuth", drop column "sun_enabled", drop column "earth_enabled", drop column "earth_as_moon";'
    );

    this.addSql(
      'alter table "preset_db" add column "sun_azimuth" double precision null, add column "sun_enabled" boolean null default true, add column "earth_azimuth" double precision null, add column "earth_enabled" boolean null default true, add column "earth_as_moon" boolean null default false;'
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      'alter table "mission_db" add column "sun_azimuth" float8 null, add column "earth_azimuth" float8 null, add column "sun_enabled" bool null default true, add column "earth_enabled" bool null default true, add column "earth_as_moon" bool null default false;'
    );

    this.addSql(
      'alter table "preset_db" drop column "sun_azimuth", drop column "sun_enabled", drop column "earth_azimuth", drop column "earth_enabled", drop column "earth_as_moon";'
    );
  }
}
