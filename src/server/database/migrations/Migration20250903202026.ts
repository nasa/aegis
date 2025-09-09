import { Migration } from "@mikro-orm/migrations";

export class Migration20250903202026 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "action_db" add column "description_task" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "action_db" drop column "description_task";`);
  }
}
