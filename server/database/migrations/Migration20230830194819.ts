import { Migration } from "@mikro-orm/migrations";

export class Migration20230830194819 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "sublayer" add column "legend" jsonb null;');
    this.addSql('alter table "sublayer" rename column "min_zoom" to "min_native_zoom";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "sublayer" drop column "legend";');
    this.addSql('alter table "sublayer" rename column "min_native_zoom" to "min_zoom";');
  }
}
