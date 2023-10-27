import { Migration } from "@mikro-orm/migrations";

export class Migration20231027220504 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "mission_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "log_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "layer_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "layer_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "rex_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "rex_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "stm_objective_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "stm_objective_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "stm_goal_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "stm_goal_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "stm_investigation_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "stm_investigation_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "sublayer_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "sublayer_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "traverse_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "traverse_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "user_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "user_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "station_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "station_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "preset_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "preset_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "poi_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "poi_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );

    this.addSql(
      'alter table "action_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "action_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "action_db" alter column "parent_copy_date" type timestamptz(3) using ("parent_copy_date"::timestamptz(3));'
    );

    this.addSql(
      'alter table "eva_db" alter column "created_at" type timestamptz(3) using ("created_at"::timestamptz(3));'
    );
    this.addSql(
      'alter table "eva_db" alter column "updated_at" type timestamptz(3) using ("updated_at"::timestamptz(3));'
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "action_db" alter column "parent_copy_date" type timestamptz using ("parent_copy_date"::timestamptz);'
    );
    this.addSql(
      'alter table "action_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "action_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "eva_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "eva_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "layer_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "layer_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "log_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );

    this.addSql(
      'alter table "mission_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "mission_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "poi_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "poi_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "preset_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "preset_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "rex_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "rex_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "station_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "station_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "stm_goal_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "stm_goal_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "stm_investigation_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "stm_investigation_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "stm_objective_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "stm_objective_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "sublayer_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "sublayer_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "traverse_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "traverse_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );

    this.addSql(
      'alter table "user_db" alter column "created_at" type timestamptz using ("created_at"::timestamptz);'
    );
    this.addSql(
      'alter table "user_db" alter column "updated_at" type timestamptz using ("updated_at"::timestamptz);'
    );
  }
}
