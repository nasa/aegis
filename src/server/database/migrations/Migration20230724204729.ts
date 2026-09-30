import { Migration } from "@mikro-orm/migrations";

export class Migration20230724204729 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "preset" add column "map_circle_controls" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "preset" drop column "map_circle_controls";');
  }
}
