import { Migration } from "@mikro-orm/migrations";

export class Migration20230815212209 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action" add column "enabled" boolean not null default true;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" drop column "enabled";');
  }
}
