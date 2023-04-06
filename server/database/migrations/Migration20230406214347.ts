import { Migration } from "@mikro-orm/migrations";

export class Migration20230406214347 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "station" add column "walkback_path_segment_elevations" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "station" drop column "walkback_path_segment_elevations";');
  }
}
