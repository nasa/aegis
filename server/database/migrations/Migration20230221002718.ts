import { Migration } from "@mikro-orm/migrations";

export class Migration20230221002718 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "traverse" add column "distance" double precision null;');

    this.addSql(
      'alter table "station" add column "walkback_location" jsonb null, add column "walkback_distance" double precision null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "station" drop column "walkback_location";');
    this.addSql('alter table "station" drop column "walkback_distance";');

    this.addSql('alter table "traverse" drop column "distance";');
  }
}
