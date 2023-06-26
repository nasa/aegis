import { Migration } from "@mikro-orm/migrations";

export class Migration20230626181040 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission" add column "walkback_speed" double precision null default 2;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "walkback_speed";');
  }
}
