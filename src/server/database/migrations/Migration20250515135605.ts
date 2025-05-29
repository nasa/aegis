import { Migration } from "@mikro-orm/migrations";

export class Migration20250515135605 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "preset_db" add column "map_grid_control" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "preset_db" drop column "map_grid_control";`);
  }
}
