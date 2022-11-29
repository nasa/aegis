import { Migration } from "@mikro-orm/migrations";

export class Migration20221123225514 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "action" rename column "stm_investigations" to "stm_investigation_uuids";'
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "action" rename column "stm_investigation_uuids" to "stm_investigations";'
    );
  }
}
