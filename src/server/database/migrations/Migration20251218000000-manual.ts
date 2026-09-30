import { Migration } from "@mikro-orm/migrations";

export class Migration20251218000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      UPDATE mission_db
      SET action_templates = (
        SELECT jsonb_agg(elem - 'missionId' - 'refUuid' - 'poiUuid' - 'stationUuid'
                                - 'traverseUuid' - 'parentActionUuid' - 'parentCopyDate'
                                - 'location' - 'elevation' - 'enabled' - 'stmUuidRefs'
                                - 'durationLower' - 'durationUpper')
        FROM jsonb_array_elements(action_templates) AS elem
      );
    `);
  }

  override async down(): Promise<void> {
    // No rollback logic provided as this is a destructive operation
  }
}
