import { Migration } from "@mikro-orm/migrations";

export class Migration20230311154602 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "traverse" add column "path_segment_elevations" jsonb null, add column "elevation_resolution_meters" double precision null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "traverse" drop column "path_segment_elevations";');
    this.addSql('alter table "traverse" drop column "elevation_resolution_meters";');
  }
}
