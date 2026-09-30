import { Migration } from "@mikro-orm/migrations";

export class Migration20230302010236 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "station" add column "icon" varchar(255) null;');

    this.addSql('alter table "poi" add column "icon" varchar(255) null;');
    this.addSql('alter table "poi" drop column "color";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "poi" add column "color" jsonb null default null;');
    this.addSql('alter table "poi" drop column "icon";');

    this.addSql('alter table "station" drop column "icon";');
  }
}
