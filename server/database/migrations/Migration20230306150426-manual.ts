import { Migration } from "@mikro-orm/migrations";

export class Migration20230306150426 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "traverse" rename column "location" to "path";');
    this.addSql('alter table "traverse" rename column "distance" to "path_segment_distances";');

    this.addSql('alter table "station" rename column "walkback_location" to "walkback_path";');
    this.addSql(
      'alter table "station" rename column "walkback_distance" to "walkback_path_segment_distances";'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "traverse" rename column "path" to "location";');
    this.addSql('alter table "traverse" rename column "path_segment_distances" to "distance";');

    this.addSql('alter table "station" rename column "walkback_path" to "walkback_location";');
    this.addSql(
      'alter table "station" rename column "walkback_path_segment_distances" to "walkback_distance";'
    );
  }
}
