import { Migration } from "@mikro-orm/migrations";

export class Migration20231124185035 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "rex_db" add column "pos_types" jsonb null;');
    this.addSql('alter table "rex_db" rename column "crew_pos" to "pos_entries";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "rex_db" rename column "pos_entries" to "crew_pos";');
    this.addSql('alter table "rex_db" drop column "pos_types";');
  }
}
