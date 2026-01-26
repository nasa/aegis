import { Migration } from "@mikro-orm/migrations";

export class Migration20251223000000 extends Migration {
  override async up(): Promise<void> {
    // add required properties to action templates
    this.addSql(`
      DO $$
      DECLARE
          action_template RECORD;
          default_values JSONB := '{
              "templateName": null,
              "name": "",
              "actionDefinition": null,
              "icon": null,
              "description": "",
              "descriptionTask": "",
              "status": "Candidate",
              "type": "other",
              "duration": null,
              "stmAction": false,
              "stmPriorities": null,
              "equipmentItemsUsage": null,
              "geographicUnitsUsage": null,
              "crewAssigned": [],
              "mass": null,
              "priority": null
          }'::jsonb;
      BEGIN
          FOR action_template IN
              SELECT id, action_templates
              FROM mission_db
              WHERE action_templates IS NOT NULL
          LOOP
              UPDATE mission_db
              SET action_templates = (
                  SELECT jsonb_agg(
                      default_values || action_template_item
                  )
                  FROM jsonb_array_elements(action_template.action_templates) AS action_template_item
              )
              WHERE id = action_template.id;
          END LOOP;
      END $$;
    `);
  }

  override async down(): Promise<void> {
    // No rollback logic provided as this is a destructive operation
  }
}
