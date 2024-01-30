import { Migration } from "@mikro-orm/migrations";

export class Migration20230601184826 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "user" add column "admin_permission" boolean null, add column "permission_list" jsonb null;'
    );
    this.addSql('alter table "user" drop column "permission";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "user" add column "permission" varchar not null default null;');
    this.addSql('alter table "user" drop column "admin_permission";');
    this.addSql('alter table "user" drop column "permission_list";');
  }
}
