import { Migration } from "@mikro-orm/migrations";

export class Migration20230803150805 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" drop column "config";');

    this.addSql('alter table "layer" drop column "layer_config";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "layer" add column "layer_config" jsonb null default null;');

    this.addSql('alter table "mission" add column "config" jsonb null default null;');
  }
}
