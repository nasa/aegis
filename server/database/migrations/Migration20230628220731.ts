import { Migration } from "@mikro-orm/migrations";

export class Migration20230628220731 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission" add column "mission_banner" text null, add column "walkback_speed" double precision null default 2;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "mission_banner";');
    this.addSql('alter table "mission" drop column "walkback_speed";');
  }
}
