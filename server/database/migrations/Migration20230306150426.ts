import { Migration } from "@mikro-orm/migrations";

export class Migration20230306150426 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "traverse" add column "path" jsonb null, add column "path_segment_distances" jsonb null;'
    );
    this.addSql('alter table "traverse" drop column "location";');
    this.addSql('alter table "traverse" drop column "distance";');

    this.addSql(
      'alter table "station" add column "walkback_path" jsonb null, add column "walkback_path_segment_distances" jsonb null;'
    );
    this.addSql('alter table "station" drop column "walkback_location";');
    this.addSql('alter table "station" drop column "walkback_distance";');
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "station" add column "walkback_location" jsonb null default null, add column "walkback_distance" jsonb null default null;'
    );
    this.addSql('alter table "station" drop column "walkback_path";');
    this.addSql('alter table "station" drop column "walkback_path_segment_distances";');

    this.addSql(
      'alter table "traverse" add column "location" jsonb null default null, add column "distance" jsonb null default null;'
    );
    this.addSql('alter table "traverse" drop column "path";');
    this.addSql('alter table "traverse" drop column "path_segment_distances";');
  }
}
