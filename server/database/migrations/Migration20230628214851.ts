import { Migration } from "@mikro-orm/migrations";

export class Migration20230628214851 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" add column "mission_banner" text null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "mission_banner";');
  }
}
