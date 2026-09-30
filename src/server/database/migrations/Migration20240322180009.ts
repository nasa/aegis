import { Migration } from "@mikro-orm/migrations";

export class Migration20240322180009 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action_db" add column "stm_priorities" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "action_db" drop column "stm_priorities";');
  }
}
