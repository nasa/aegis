import { Migration } from "@mikro-orm/migrations";

export class Migration20230817224351 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" rename column "traverse_speed" to "traverse_rate";');
    this.addSql('alter table "mission" rename column "walkback_speed" to "walkback_rate";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" rename column "traverse_rate" to "traverse_speed";');
    this.addSql('alter table "mission" rename column "walkback_rate" to "walkback_speed";');
  }
}
