import { Migration } from "@mikro-orm/migrations";

export class Migration20240916155602 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'alter table "station_db" add column "walkback_traverse_rate" double precision null;'
    );
  }

  override async down(): Promise<void> {
    this.addSql('alter table "station_db" drop column "walkback_traverse_rate";');
  }
}
