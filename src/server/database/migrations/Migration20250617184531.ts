import { Migration } from "@mikro-orm/migrations";

export class Migration20250617184531 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "rex_db" add column "maestro_controlled" boolean not null default false;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "rex_db" drop column "maestro_controlled";`);
  }
}
