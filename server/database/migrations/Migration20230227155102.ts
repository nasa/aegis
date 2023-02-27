import { Migration } from "@mikro-orm/migrations";

export class Migration20230227155102 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission" add column "lander_location" jsonb null, add column "traverse_speed" double precision null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "lander_location";');
    this.addSql('alter table "mission" drop column "traverse_speed";');
  }
}
