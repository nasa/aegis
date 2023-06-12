import { Migration } from "@mikro-orm/migrations";

export class Migration20230605195127 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "preset" add column "layer_order" jsonb null;');
    this.addSql('alter table "preset" rename column "layer_controls" to "map_layer_controls";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "preset" drop column "layer_order";');
    this.addSql('alter table "preset" rename column "map_layer_controls" to "layer_controls";');
  }
}
