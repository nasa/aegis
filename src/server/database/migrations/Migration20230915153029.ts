import { Migration } from "@mikro-orm/migrations";

export class Migration20230915153029 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "rex" add column "crew_pos" jsonb null;');

    this.addSql('alter table "eva" drop column "rex_crew_pos";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva" add column "rex_crew_pos" jsonb null default null;');

    this.addSql('alter table "rex" drop column "crew_pos";');
  }
}
