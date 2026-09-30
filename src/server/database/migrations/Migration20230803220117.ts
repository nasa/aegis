import { Migration } from "@mikro-orm/migrations";

export class Migration20230803220117 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" add column "action_templates" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "action_templates";');
  }
}
