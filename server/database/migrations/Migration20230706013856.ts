import { Migration } from "@mikro-orm/migrations";

export class Migration20230706013856 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" add column "equipment_items" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "equipment_items";');
  }
}
