import { Migration } from "@mikro-orm/migrations";

export class Migration20250424191013 extends Migration {
  override async up(): Promise<void> {
    // Remove unused column
    this.addSql(`alter table "preset_db" drop column "mission_preset";`);

    // Rename mission_preset_default to mission_default
    this.addSql(
      `alter table "preset_db" rename column "mission_preset_default" to "mission_default";`
    );
  }

  override async down(): Promise<void> {
    // Rename mission_default back
    this.addSql(
      `alter table "preset_db" rename column "mission_default" to "mission_preset_default";`
    );

    // Re-add dropped mission_preset column
    this.addSql(
      `alter table "preset_db" add column "mission_preset" boolean not null default false;`
    );
  }
}
