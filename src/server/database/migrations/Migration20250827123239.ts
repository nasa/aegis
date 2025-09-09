import { Migration } from "@mikro-orm/migrations";

export class Migration20250827123239 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "rex_db" add column "maestro_activity_properties_by_ref_uuid" jsonb null, add column "version" int not null default 1;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "rex_db" drop column "maestro_activity_properties_by_ref_uuid", drop column "version";`
    );
  }
}
