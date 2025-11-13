import { Migration } from "@mikro-orm/migrations";

export class Migration20251103144444 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "grid_db" add column if not exists "file_name" text null;`);
    this.addSql(`
      update "grid_db"
      set "file_name" = 'grid_' || uuid::text || '.json'
      where "file_name" is null or "file_name" = '';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "grid_db" drop column if exists "file_name";`);
  }
}
