import { Migration } from "@mikro-orm/migrations";

export class Migration20221123225621 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action" rename column "stm_investigation_uuids" to "stm_uuid_refs";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" rename column "stm_uuid_refs" to "stm_investigation_uuids";');
  }
}
