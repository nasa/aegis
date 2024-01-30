import { Migration } from "@mikro-orm/migrations";

export class Migration20230907205203 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "eva" add column "rex_crew_pos" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva" drop column "rex_crew_pos";');
  }
}
