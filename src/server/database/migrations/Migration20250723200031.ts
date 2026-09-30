import { Migration } from "@mikro-orm/migrations";

export class Migration20250723200031 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "rex_db" add column "maestro_execution_hash" varchar(255) null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "rex_db" drop column "maestro_execution_hash";`);
  }
}
