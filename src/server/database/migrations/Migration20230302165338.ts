import { Migration } from "@mikro-orm/migrations";

export class Migration20230302165338 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "traverse" drop column "distance";');
    this.addSql('alter table "traverse" add column "distance" jsonb null;');

    this.addSql('alter table "station" drop column "walkback_distance";');
    this.addSql('alter table "station" add column "walkback_distance" jsonb null;');

    this.addSql('alter table "eva" add column "traverse_rate" double precision null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva" drop column "traverse_rate";');

    this.addSql('alter table "station" drop column "walkback_distance";');
    this.addSql('alter table "station" add column "walkback_distance" float8 null;');
    this.addSql('alter table "traverse" drop column "distance";');

    this.addSql('alter table "traverse" add column "distance" float8 null;');
  }
}
