import { Migration } from "@mikro-orm/migrations";

export class Migration20230623214236 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission" add column "description" text null, add column "sun_azimuth" double precision null, add column "earth_azimuth" double precision null, add column "sun_azimuth_visible" boolean not null default false, add column "earth_azimuth_visible" boolean not null default false, add column "default_eva_duration" double precision null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "description";');
    this.addSql('alter table "mission" drop column "sun_azimuth";');
    this.addSql('alter table "mission" drop column "earth_azimuth";');
    this.addSql('alter table "mission" drop column "sun_azimuth_visible";');
    this.addSql('alter table "mission" drop column "earth_azimuth_visible";');
    this.addSql('alter table "mission" drop column "default_eva_duration";');
  }
}
