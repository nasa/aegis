import { Migration } from "@mikro-orm/migrations";

export class Migration20230710203501 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" add column "lander_radii" jsonb null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "lander_radii";');
  }
}
