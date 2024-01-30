import { Migration } from "@mikro-orm/migrations";

export class Migration20230711173325 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "user" add column "is_super_admin" boolean null default false');
    this.addSql('alter table "user" rename column "admin_permission" to "is_admin";');
    this.addSql('alter table "user" drop column "email";');
    this.addSql('update "user" set "is_super_admin"=true where "id"=1;');
    this.addSql('alter table "user" drop column "token";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "user" drop column "is_super_admin";');
    this.addSql('alter table "user" rename column "is_admin" to "admin_permission";');
    this.addSql('alter table "user" add column "email" text default null;');
    this.addSql('alter table "user" add column "token" varchar(2048) null;');
  }
}
