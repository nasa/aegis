import { Migration } from "@mikro-orm/migrations";

export class Migration20250826160045 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "rex_db" add column "maestro_event_url" varchar(255) null;`);
    this.addSql(
      `alter table "rex_db" rename column "maestro_execution_hash" to "maestro_event_id";`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "rex_db" drop column "maestro_event_url";`);

    this.addSql(
      `alter table "rex_db" rename column "maestro_event_id" to "maestro_execution_hash";`
    );
  }
}
