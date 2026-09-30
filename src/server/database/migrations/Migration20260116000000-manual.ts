import { Migration } from "@mikro-orm/migrations";

export class Migration20260116000000 extends Migration {
  override async up(): Promise<void> {
    // Change mission table equipmentItems, geographicUnits, circleDefinitions, and actionTemplates
    // into object maps that are keyed by uuid
    this.addSql(`
      DO $$
      DECLARE
          mission_record RECORD;
      BEGIN
          FOR mission_record IN
              SELECT id, equipment_items, geographic_units, circle_definitions, action_templates
              FROM mission_db
          LOOP
              -- Convert equipmentItems array to object map keyed by uuid
              IF mission_record.equipment_items IS NOT NULL THEN
                  UPDATE mission_db
                  SET equipment_items = (
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.equipment_items) AS item
                  )
                  WHERE id = mission_record.id;
              END IF;

              -- Convert geographicUnits array to object map keyed by uuid
              IF mission_record.geographic_units IS NOT NULL THEN
                  UPDATE mission_db
                  SET geographic_units = (
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.geographic_units) AS item
                  )
                  WHERE id = mission_record.id;
              END IF;

              -- Convert circleDefinitions array to object map keyed by uuid
              IF mission_record.circle_definitions IS NOT NULL THEN
                  UPDATE mission_db
                  SET circle_definitions = (
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.circle_definitions) AS item
                  )
                  WHERE id = mission_record.id;
              END IF;

              -- Convert actionTemplates array to object map keyed by uuid
              IF mission_record.action_templates IS NOT NULL THEN
                  UPDATE mission_db
                  SET action_templates = (
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.action_templates) AS item
                  )
                  WHERE id = mission_record.id;
              END IF;
          END LOOP;
      END $$;
    `);

    // Convert actionDefinitions verbs/nouns/adjectives in the mission table
    // from arrays to object maps keyed by uuid
    this.addSql(`
      DO $$
      DECLARE
          mission_record RECORD;
          new_action_definitions JSONB;
      BEGIN
          FOR mission_record IN
              SELECT id, action_definitions
              FROM mission_db
              WHERE action_definitions IS NOT NULL
          LOOP
              new_action_definitions := jsonb_build_object(
                  'verbs', COALESCE((
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.action_definitions->'verbs') AS item
                  ), '{}'::jsonb),
                  'nouns', COALESCE((
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.action_definitions->'nouns') AS item
                  ), '{}'::jsonb),
                  'adjectives', COALESCE((
                      SELECT jsonb_object_agg(
                          item->>'uuid',
                          item - 'uuid'
                      )
                      FROM jsonb_array_elements(mission_record.action_definitions->'adjectives') AS item
                  ), '{}'::jsonb)
              );

              UPDATE mission_db
              SET action_definitions = new_action_definitions
              WHERE id = mission_record.id;
          END LOOP;
      END $$;
    `);

    // Update Action table equipmentItemsUsage to be an object map
    this.addSql(`
      DO $$
      DECLARE
          action_record RECORD;
      BEGIN
          FOR action_record IN
              SELECT uuid, equipment_items_usage
              FROM action_db
              WHERE equipment_items_usage IS NOT NULL
          LOOP
              UPDATE action_db
              SET equipment_items_usage = (
                  SELECT jsonb_object_agg(
                      item->>'uuid',
                      jsonb_build_object('quantityUsed', item->'quantityUsed')
                  )
                  FROM jsonb_array_elements(action_record.equipment_items_usage) AS item
              )
              WHERE uuid = action_record.uuid;
          END LOOP;
      END $$;
    `);
  }

  override async down(): Promise<void> {
    // No rollback logic provided as this is a destructive operation
  }
}
