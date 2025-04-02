import { Migration } from "@mikro-orm/migrations";

export class Migration20250320154020 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "rex_db" add column "xgress_entries" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "rex_db" drop column "xgress_entries";`);
  }
}
