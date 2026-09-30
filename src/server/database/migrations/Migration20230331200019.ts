import { Migration } from "@mikro-orm/migrations";

export class Migration20230331200019 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission" add column "lander_elevation_meters" double precision null;'
    );

    this.addSql('alter table "traverse" drop column "elevation_resolution_meters";');

    this.addSql('alter table "station" add column "elevation" real null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "lander_elevation_meters";');

    this.addSql('alter table "station" drop column "elevation";');

    this.addSql(
      'alter table "traverse" add column "elevation_resolution_meters" float8 null default null;'
    );
  }
}
