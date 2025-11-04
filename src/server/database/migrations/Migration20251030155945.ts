import { Migration } from "@mikro-orm/migrations";

export class Migration20251030155945 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "action_db" drop column "stm_uuid_refs";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "action_db" add column "stm_uuid_refs" jsonb null;`);
  }
}
