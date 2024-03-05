import { Migration } from "@mikro-orm/migrations";

export class Migration20230804235801 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action" rename column "priority_override" to "priority";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" rename column "priority" to "priority_override";');
  }
}
