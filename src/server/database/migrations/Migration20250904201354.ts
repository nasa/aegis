import { Migration } from "@mikro-orm/migrations";

export class Migration20250904201354 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "eva_db" add column "show_edit_warning" boolean not null default false, add column "edit_warning_msg" text null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "eva_db" drop column "show_edit_warning", drop column "edit_warning_msg";`
    );
  }
}
