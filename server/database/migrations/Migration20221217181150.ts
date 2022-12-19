import { Migration } from "@mikro-orm/migrations";

export class Migration20221217181150 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "preset" add column "mission_preset_default" boolean not null default false;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "preset" drop column "mission_preset_default";');
  }
}
