import { Migration } from "@mikro-orm/migrations";

export class Migration20260305214642 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "sublayer_db" drop column "style";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "sublayer_db" add column "style" jsonb null;`);
  }
}
