import { Migration } from "@mikro-orm/migrations";

export class Migration20250716000000_manual extends Migration {
  override async up(): Promise<void> {
    // Change all timestamp columns from timestamptz(3) to timestamp(3)

    // Action_db table
    this.addSql(`alter table "action_db" alter column "parent_copy_date" type timestamp(3);`);
    this.addSql(`alter table "action_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "action_db" alter column "updated_at" type timestamp(3);`);

    // App_User_db table
    this.addSql(`alter table "app_user_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "app_user_db" alter column "updated_at" type timestamp(3);`);

    // Eva_db table
    this.addSql(`alter table "eva_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "eva_db" alter column "updated_at" type timestamp(3);`);

    // Folder_db table
    this.addSql(`alter table "folder_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "folder_db" alter column "updated_at" type timestamp(3);`);

    // Layer_db table
    this.addSql(`alter table "layer_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "layer_db" alter column "updated_at" type timestamp(3);`);

    // Mission_db table
    this.addSql(`alter table "mission_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "mission_db" alter column "updated_at" type timestamp(3);`);

    // Poi_db table
    this.addSql(`alter table "poi_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "poi_db" alter column "updated_at" type timestamp(3);`);

    // Preset_db table
    this.addSql(`alter table "preset_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "preset_db" alter column "updated_at" type timestamp(3);`);

    // Rex_db table
    this.addSql(`alter table "rex_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "rex_db" alter column "updated_at" type timestamp(3);`);

    // Station_db table
    this.addSql(`alter table "station_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "station_db" alter column "updated_at" type timestamp(3);`);

    // STM_Level1_db table
    this.addSql(`alter table "stm_level1_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "stm_level1_db" alter column "updated_at" type timestamp(3);`);

    // STM_Level2_db table
    this.addSql(`alter table "stm_level2_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "stm_level2_db" alter column "updated_at" type timestamp(3);`);

    // STM_Level3_db table
    this.addSql(`alter table "stm_level3_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "stm_level3_db" alter column "updated_at" type timestamp(3);`);

    // STM_Rule_db table
    this.addSql(`alter table "stm_rule_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "stm_rule_db" alter column "updated_at" type timestamp(3);`);

    // Sublayer_db table
    this.addSql(`alter table "sublayer_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "sublayer_db" alter column "updated_at" type timestamp(3);`);

    // Traverse_db table
    this.addSql(`alter table "traverse_db" alter column "created_at" type timestamp(3);`);
    this.addSql(`alter table "traverse_db" alter column "updated_at" type timestamp(3);`);
  }

  override async down(): Promise<void> {
    // Revert all timestamp columns back to timestamptz(3)

    // Action_db table
    this.addSql(`alter table "action_db" alter column "parent_copy_date" type timestamptz(3);`);
    this.addSql(`alter table "action_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "action_db" alter column "updated_at" type timestamptz(3);`);

    // App_User_db table
    this.addSql(`alter table "app_user_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "app_user_db" alter column "updated_at" type timestamptz(3);`);

    // Eva_db table
    this.addSql(`alter table "eva_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "eva_db" alter column "updated_at" type timestamptz(3);`);

    // Folder_db table
    this.addSql(`alter table "folder_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "folder_db" alter column "updated_at" type timestamptz(3);`);

    // Layer_db table
    this.addSql(`alter table "layer_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "layer_db" alter column "updated_at" type timestamptz(3);`);

    // Mission_db table
    this.addSql(`alter table "mission_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "mission_db" alter column "updated_at" type timestamptz(3);`);

    // Poi_db table
    this.addSql(`alter table "poi_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "poi_db" alter column "updated_at" type timestamptz(3);`);

    // Preset_db table
    this.addSql(`alter table "preset_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "preset_db" alter column "updated_at" type timestamptz(3);`);

    // Rex_db table
    this.addSql(`alter table "rex_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "rex_db" alter column "updated_at" type timestamptz(3);`);

    // Station_db table
    this.addSql(`alter table "station_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "station_db" alter column "updated_at" type timestamptz(3);`);

    // STM_Level1_db table
    this.addSql(`alter table "stm_level1_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "stm_level1_db" alter column "updated_at" type timestamptz(3);`);

    // STM_Level2_db table
    this.addSql(`alter table "stm_level2_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "stm_level2_db" alter column "updated_at" type timestamptz(3);`);

    // STM_Level3_db table
    this.addSql(`alter table "stm_level3_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "stm_level3_db" alter column "updated_at" type timestamptz(3);`);

    // STM_Rule_db table
    this.addSql(`alter table "stm_rule_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "stm_rule_db" alter column "updated_at" type timestamptz(3);`);

    // Sublayer_db table
    this.addSql(`alter table "sublayer_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "sublayer_db" alter column "updated_at" type timestamptz(3);`);

    // Traverse_db table
    this.addSql(`alter table "traverse_db" alter column "created_at" type timestamptz(3);`);
    this.addSql(`alter table "traverse_db" alter column "updated_at" type timestamptz(3);`);
  }
}
