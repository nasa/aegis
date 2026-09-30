import { Migration } from "@mikro-orm/migrations";

export class Migration20241022190912 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "rex_db" add column "pos_sources" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "rex_db" drop column "pos_sources";`);
  }
}
