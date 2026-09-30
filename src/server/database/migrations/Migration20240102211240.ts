import { Migration } from "@mikro-orm/migrations";

export class Migration20240102211240 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "traverse_db" add column "color" varchar(255) null;');

    this.addSql('alter table "eva_db" add column "traverse_color" varchar(255) null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva_db" drop column "traverse_color";');

    this.addSql('alter table "traverse_db" drop column "color";');
  }
}
