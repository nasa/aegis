import { Migration } from "@mikro-orm/migrations";

export class Migration20230710142653 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action" add column "mass" double precision null;');
    this.addSql('alter table "action" rename column "inventory_items" to "equipment_items_usage";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" drop column "mass";');
    this.addSql('alter table "action" rename column "equipment_items_usage" to "inventory_items";');
  }
}
