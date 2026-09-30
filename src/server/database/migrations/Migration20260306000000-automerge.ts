import { Migration } from "@mikro-orm/migrations";

export class Migration20260306000000 extends Migration {
  override async up(): Promise<void> {
    // create a new table called doc_listing_db to track automerge document listings
    this.addSql(
      `create table "doc_listing_db" ("mission_id" serial primary key, "automerge_url" text null, "version" int not null default 1);`
    );
    // set the auto increment to the max id in the mission_db table so it picks up from there
    this.addSql(
      "SELECT setval('doc_listing_db_mission_id_seq', COALESCE((SELECT MAX(id) + 1 FROM mission_db), 1), false);"
    );

    // create the native unreadable automerge table for automerge to use
    this.addSql(
      'create table "automerge_native_db" ("key" BYTEA[] not null, "value" BYTEA not null, constraint "automerge_native_db_pkey" primary key ("key"));'
    );

    // Update mission_db date columns to double precision
    this.addSql(
      `alter table "mission_db" alter column "created_at" type double precision using (extract(epoch from "created_at") * 1000);`
    );
    this.addSql(
      `alter table "mission_db" alter column "updated_at" type double precision using (extract(epoch from "updated_at") * 1000);`
    );
    // Update JSON date fields in mission action_templates to use numbers
    this.addSql(`
      DO $$
      DECLARE
          mission_record RECORD;
          template_key TEXT;
          template_value JSONB;
          updated_templates JSONB;
      BEGIN
          FOR mission_record IN
              SELECT id, action_templates
              FROM mission_db
              WHERE action_templates IS NOT NULL AND jsonb_typeof(action_templates) = 'object'
          LOOP
              updated_templates := '{}'::jsonb;

              FOR template_key, template_value IN
                  SELECT * FROM jsonb_each(mission_record.action_templates)
              LOOP
                  template_value := jsonb_set(
                      template_value,
                      '{createdAt}',
                      CASE
                          WHEN template_value->>'createdAt' IS NULL THEN 'null'::jsonb
                          ELSE to_jsonb((extract(epoch from (template_value->>'createdAt')::timestamptz) * 1000))
                      END
                  );

                  template_value := jsonb_set(
                      template_value,
                      '{updatedAt}',
                      CASE
                          WHEN template_value->>'updatedAt' IS NULL THEN
                              CASE
                                  WHEN template_value->>'createdAt' IS NULL THEN 'null'::jsonb
                                  ELSE to_jsonb((extract(epoch from (template_value->>'createdAt')::timestamptz) * 1000))
                              END
                          ELSE to_jsonb((extract(epoch from (template_value->>'updatedAt')::timestamptz) * 1000))
                      END
                  );

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

    // Update action_db date columns to double precision
    this.addSql(
      `alter table "action_db" alter column "updated_at" type double precision using (
        CASE WHEN "updated_at" IS NULL
        THEN (extract(epoch from "created_at") * 1000)
        ELSE (extract(epoch from "updated_at") * 1000)
        END
      );`
    );
    this.addSql(
      `alter table "action_db" alter column "created_at" type double precision using (extract(epoch from "created_at") * 1000);`
    );
    this.addSql(
      `alter table "action_db" alter column "parent_copy_date" type double precision using (
        CASE WHEN "parent_copy_date" IS NULL
        THEN NULL
        ELSE (extract(epoch from "parent_copy_date") * 1000)
        END
      );`
    );

    // Remove all foreign key constraints on mission id to regular integers
    // This ensures a proper disconnect to the old mission_db table
    this.addSql(`alter table "eva_db" drop constraint "eva_db_mission_id_foreign";`);
    this.addSql(`alter table "folder_db" drop constraint "folder_db_mission_id_foreign";`);
    this.addSql(`alter table "grid_db" drop constraint "grid_db_mission_id_foreign";`);
    this.addSql(`alter table "layer_db" drop constraint "layer_db_mission_id_foreign";`);
    this.addSql(`alter table "poi_db" drop constraint "poi_db_mission_id_foreign";`);
    this.addSql(`alter table "preset_db" drop constraint "preset_db_mission_id_foreign";`);
    this.addSql(`alter table "rex_db" drop constraint "rex_db_mission_id_foreign";`);
    this.addSql(`alter table "station_db" drop constraint "station_db_mission_id_foreign";`);
    this.addSql(`alter table "stm_level1_db" drop constraint "stm_level1_db_mission_id_foreign";`);
    this.addSql(`alter table "stm_rule_db" drop constraint "stm_rule_db_mission_id_foreign";`);
    this.addSql(`alter table "sublayer_db" drop constraint "sublayer_db_mission_id_foreign";`);
    this.addSql(`alter table "traverse_db" drop constraint "traverse_db_mission_id_foreign";`);
    this.addSql(`alter table "action_db" drop constraint "action_db_mission_id_foreign";`);

    // Remove the 'name' field from each entry in the mapCircleControls JSONB column for station and preset
    this.addSql(`
      UPDATE preset_db
      SET map_circle_controls = (
        SELECT jsonb_object_agg(key, value - 'name')
        FROM jsonb_each(map_circle_controls)
      )
      WHERE map_circle_controls IS NOT NULL
        AND map_circle_controls <> '{}'::jsonb;
    `);
    this.addSql(`
      UPDATE station_db
      SET map_circle_controls = (
        SELECT jsonb_object_agg(key, value - 'name')
        FROM jsonb_each(map_circle_controls)
      )
      WHERE map_circle_controls IS NOT NULL
        AND map_circle_controls <> '{}'::jsonb;
    `);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "automerge_native_db" cascade;');
    this.addSql('drop table if exists "doc_listing_db" cascade;');

    this.addSql(
      `alter table "action_db" alter column "parent_copy_date" type timestamptz(3) using (to_timestamp("parent_copy_date"/1000));`
    );
    this.addSql(
      `alter table "action_db" alter column "created_at" type timestamptz(3) using (to_timestamp("created_at"/1000));`
    );
    this.addSql(
      `alter table "action_db" alter column "updated_at" type timestamptz(3) using (to_timestamp("updated_at"/1000));`
    );

    this.addSql(
      `alter table "mission_db" alter column "created_at" type timestamptz(3) using (to_timestamp("created_at"/1000));`
    );
    this.addSql(
      `alter table "mission_db" alter column "updated_at" type timestamptz(3) using (to_timestamp("updated_at"/1000));`
    );

    // Revert JSON fields in action_templates back to timestamp strings
    this.addSql(`
      DO $$
      DECLARE
          mission_record RECORD;
          template_key TEXT;
          template_value JSONB;
          updated_templates JSONB;
      BEGIN
          FOR mission_record IN
              SELECT id, action_templates
              FROM mission_db
              WHERE action_templates IS NOT NULL AND jsonb_typeof(action_templates) = 'object'
          LOOP
              updated_templates := '{}'::jsonb;

              FOR template_key, template_value IN
                  SELECT * FROM jsonb_each(mission_record.action_templates)
              LOOP
                  template_value := jsonb_set(
                      template_value,
                      '{createdAt}',
                      CASE
                          WHEN template_value->>'createdAt' IS NULL THEN 'null'::jsonb
                          ELSE to_jsonb(to_char(to_timestamp((template_value->>'createdAt')::float / 1000), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                      END
                  );

                  template_value := jsonb_set(
                      template_value,
                      '{updatedAt}',
                      CASE
                          WHEN template_value->>'updatedAt' IS NULL THEN 'null'::jsonb
                          ELSE to_jsonb(to_char(to_timestamp((template_value->>'updatedAt')::float / 1000), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                      END
                  );

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

    // Add back all the foreign key constraints on mission id
    this.addSql(
      `alter table "action_db" add constraint "action_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "eva_db" add constraint "eva_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "folder_db" add constraint "folder_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "grid_db" add constraint "grid_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete set null;`
    );

    this.addSql(
      `alter table "layer_db" add constraint "layer_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "poi_db" add constraint "poi_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "preset_db" add constraint "preset_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "rex_db" add constraint "rex_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "station_db" add constraint "station_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "stm_level1_db" add constraint "stm_level1_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "stm_rule_db" add constraint "stm_rule_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "sublayer_db" add constraint "sublayer_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "traverse_db" add constraint "traverse_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );
  }
}
