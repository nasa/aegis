import { Migration } from "@mikro-orm/migrations";

export class Migration20260126000000 extends Migration {
  override async up(): Promise<void> {
    // Update mission table action templates equipmentItemsUsage to be an object map
    this.addSql(`
      DO $$
      DECLARE
          mission_record RECORD;
          template_key TEXT;
          template_value JSONB;
          updated_templates JSONB;
          updated_equipment JSONB;
      BEGIN
          FOR mission_record IN
              SELECT id, action_templates
              FROM mission_db
              WHERE action_templates IS NOT NULL
          LOOP
              updated_templates := '{}'::jsonb;

              FOR template_key, template_value IN
                  SELECT * FROM jsonb_each(mission_record.action_templates)
              LOOP
                  IF template_value->'equipmentItemsUsage' IS NOT NULL
                     AND jsonb_typeof(template_value->'equipmentItemsUsage') = 'array' THEN
                      updated_equipment := (
                          SELECT jsonb_object_agg(
                              item->>'uuid',
                              jsonb_build_object('quantityUsed', item->'quantityUsed')
                          )
                          FROM jsonb_array_elements(template_value->'equipmentItemsUsage') AS item
                      );

                      template_value := jsonb_set(
                          template_value,
                          '{equipmentItemsUsage}',
                          updated_equipment
                      );
                  END IF;

                  updated_templates := jsonb_set(
                      updated_templates,
                      array[template_key],
                      template_value
                  );
              END LOOP;

              UPDATE mission_db
              SET action_templates = updated_templates
              WHERE id = mission_record.id;
          END LOOP;
      END $$;
    `);
  }

  override async down(): Promise<void> {
    // No rollback logic provided as this is a destructive operation
  }
}
