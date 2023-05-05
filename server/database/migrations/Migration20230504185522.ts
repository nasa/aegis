import { Migration } from "@mikro-orm/migrations";

export class Migration20230504185522 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "poi" add column "elevation" real null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "poi" drop column "elevation";');
  }
}
