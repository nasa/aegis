import { Migration } from "@mikro-orm/migrations";

export class Migration20230812180600 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "action" add column "icon" varchar(255) null, add column "location" jsonb null, add column "elevation" real null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" drop column "icon";');
    this.addSql('alter table "action" drop column "location";');
    this.addSql('alter table "action" drop column "elevation";');
  }
}
