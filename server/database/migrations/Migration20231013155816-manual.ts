import { Migration } from "@mikro-orm/migrations";

export class Migration20231013155816 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action" drop constraint "action_parent_action_uuid_foreign";');

    this.addSql('alter table "sublayer" drop constraint "sublayer_layer_uuid_foreign";');

    this.addSql('alter table "action" drop constraint "action_mission_id_foreign";');

    this.addSql('alter table "eva" drop constraint "eva_mission_id_foreign";');

    this.addSql('alter table "layer" drop constraint "layer_mission_id_foreign";');

    this.addSql('alter table "log" drop constraint "log_mission_id_foreign";');

    this.addSql('alter table "poi" drop constraint "poi_mission_id_foreign";');

    this.addSql('alter table "preset" drop constraint "preset_mission_id_foreign";');

    this.addSql('alter table "rex" drop constraint "rex_mission_id_foreign";');

    this.addSql('alter table "station" drop constraint "station_mission_id_foreign";');

    this.addSql('alter table "stm_objective" drop constraint "stm_objective_mission_id_foreign";');

    this.addSql('alter table "sublayer" drop constraint "sublayer_mission_id_foreign";');

    this.addSql('alter table "traverse" drop constraint "traverse_mission_id_foreign";');

    this.addSql('alter table "action" drop constraint "action_poi_uuid_foreign";');

    this.addSql('alter table "station_poi" drop constraint "station_poi_poi_uuid_foreign";');

    this.addSql('alter table "action" drop constraint "action_station_uuid_foreign";');

    this.addSql('alter table "station_poi" drop constraint "station_poi_station_uuid_foreign";');

    this.addSql(
      'alter table "stm_investigation" drop constraint "stm_investigation_goal_uuid_foreign";'
    );

    this.addSql('alter table "stm_goal" drop constraint "stm_goal_objective_uuid_foreign";');

    this.addSql('alter table "eva" drop constraint "eva_owner_id_foreign";');

    this.addSql('alter table "poi" drop constraint "poi_owner_id_foreign";');

    this.addSql('alter table "preset" drop constraint "preset_owner_id_foreign";');

    this.addSql('alter table "station" drop constraint "station_owner_id_foreign";');

    this.addSql('alter table "action" rename to "action_db";');
    this.addSql('alter table "eva" rename to "eva_db";');
    this.addSql('alter table "layer" rename to "layer_db";');
    this.addSql('alter table "log" rename to "log_db";');
    this.addSql('alter table "mission" rename to "mission_db";');
    this.addSql('alter table "poi" rename to "poi_db";');
    this.addSql('alter table "preset" rename to "preset_db";');
    this.addSql('alter table "rex" rename to "rex_db";');
    this.addSql('alter table "station" rename to "station_db";');
    this.addSql('alter table "station_poi" rename to "station_db_poi";');
    this.addSql('alter table "station_db_poi" rename column "station_uuid" to "station_db_uuid";');
    this.addSql('alter table "station_db_poi" rename column "poi_uuid" to "poi_db_uuid";');
    this.addSql('alter table "stm_goal" rename to "stm_goal_db";');
    this.addSql('alter table "stm_investigation" rename to "stm_investigation_db";');
    this.addSql('alter table "stm_objective" rename to "stm_objective_db";');
    this.addSql('alter table "sublayer" rename to "sublayer_db";');
    this.addSql('alter table "traverse" rename to "traverse_db";');
    this.addSql('alter table "user" rename to "user_db";');

    this.addSql(
      'alter table "log_db" add constraint "log_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "layer_db" add constraint "layer_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "rex_db" add constraint "rex_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "stm_objective_db" add constraint "stm_objective_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "stm_goal_db" add constraint "stm_goal_db_objective_uuid_foreign" foreign key ("objective_uuid") references "stm_objective_db" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "stm_investigation_db" add constraint "stm_investigation_db_goal_uuid_foreign" foreign key ("goal_uuid") references "stm_goal_db" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "sublayer_db" add constraint "sublayer_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "sublayer_db" add constraint "sublayer_db_layer_uuid_foreign" foreign key ("layer_uuid") references "layer_db" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "traverse_db" add constraint "traverse_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "station_db" add constraint "station_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "station_db" add constraint "station_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "preset_db" add constraint "preset_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "preset_db" add constraint "preset_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "poi_db" add constraint "poi_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "poi_db" add constraint "poi_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "station_db_poi" add constraint "station_db_poi_station_db_uuid_foreign" foreign key ("station_db_uuid") references "station_db" ("uuid") on update cascade on delete cascade;'
    );
    this.addSql(
      'alter table "station_db_poi" add constraint "station_db_poi_poi_db_uuid_foreign" foreign key ("poi_db_uuid") references "poi_db" ("uuid") on update cascade on delete cascade;'
    );

    this.addSql(
      'alter table "action_db" add constraint "action_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "action_db" add constraint "action_db_poi_uuid_foreign" foreign key ("poi_uuid") references "poi_db" ("uuid") on update cascade on delete set null;'
    );
    this.addSql(
      'alter table "action_db" add constraint "action_db_station_uuid_foreign" foreign key ("station_uuid") references "station_db" ("uuid") on update cascade on delete set null;'
    );
    this.addSql(
      'alter table "action_db" add constraint "action_db_parent_action_uuid_foreign" foreign key ("parent_action_uuid") references "action_db" ("uuid") on update cascade on delete set null;'
    );

    this.addSql(
      'alter table "eva_db" add constraint "eva_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "eva_db" add constraint "eva_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "log_db" drop constraint "log_db_mission_id_foreign";');

    this.addSql('alter table "layer_db" drop constraint "layer_db_mission_id_foreign";');

    this.addSql('alter table "rex_db" drop constraint "rex_db_mission_id_foreign";');

    this.addSql(
      'alter table "stm_objective_db" drop constraint "stm_objective_db_mission_id_foreign";'
    );

    this.addSql('alter table "sublayer_db" drop constraint "sublayer_db_mission_id_foreign";');

    this.addSql('alter table "traverse_db" drop constraint "traverse_db_mission_id_foreign";');

    this.addSql('alter table "station_db" drop constraint "station_db_mission_id_foreign";');

    this.addSql('alter table "preset_db" drop constraint "preset_db_mission_id_foreign";');

    this.addSql('alter table "poi_db" drop constraint "poi_db_mission_id_foreign";');

    this.addSql('alter table "action_db" drop constraint "action_db_mission_id_foreign";');

    this.addSql('alter table "eva_db" drop constraint "eva_db_mission_id_foreign";');

    this.addSql('alter table "sublayer_db" drop constraint "sublayer_db_layer_uuid_foreign";');

    this.addSql('alter table "stm_goal_db" drop constraint "stm_goal_db_objective_uuid_foreign";');

    this.addSql(
      'alter table "stm_investigation_db" drop constraint "stm_investigation_db_goal_uuid_foreign";'
    );

    this.addSql('alter table "station_db" drop constraint "station_db_owner_id_foreign";');

    this.addSql('alter table "preset_db" drop constraint "preset_db_owner_id_foreign";');

    this.addSql('alter table "poi_db" drop constraint "poi_db_owner_id_foreign";');

    this.addSql('alter table "eva_db" drop constraint "eva_db_owner_id_foreign";');

    this.addSql(
      'alter table "station_db_poi" drop constraint "station_db_poi_station_db_uuid_foreign";'
    );

    this.addSql('alter table "action_db" drop constraint "action_db_station_uuid_foreign";');

    this.addSql(
      'alter table "station_db_poi" drop constraint "station_db_poi_poi_db_uuid_foreign";'
    );

    this.addSql('alter table "action_db" drop constraint "action_db_poi_uuid_foreign";');

    this.addSql('alter table "action_db" drop constraint "action_db_parent_action_uuid_foreign";');

    this.addSql('alter table "action_db" rename to "action";');
    this.addSql('alter table "eva_db" rename to "eva";');
    this.addSql('alter table "layer_db" rename to "layer";');
    this.addSql('alter table "log_db" rename to "log";');
    this.addSql('alter table "mission_db" rename to "mission";');
    this.addSql('alter table "poi_db" rename to "poi";');
    this.addSql('alter table "preset_db" rename to "preset";');
    this.addSql('alter table "rex_db" rename to "rex";');
    this.addSql('alter table "station_db" rename to "station";');
    this.addSql('alter table "station_db_poi" rename to "station_poi";');
    this.addSql('alter table "station_poi" rename column "station_db_uuid" to "station_uuid";');
    this.addSql('alter table "station_poi" rename column "poi_db_uuid" to "poi_uuid";');
    this.addSql('alter table "stm_goal_db" rename to "stm_goal";');
    this.addSql('alter table "stm_investigation_db" rename to "stm_investigation";');
    this.addSql('alter table "stm_objective_db" rename to "stm_objective";');
    this.addSql('alter table "sublayer_db" rename to "sublayer";');
    this.addSql('alter table "traverse_db" rename to "traverse";');
    this.addSql('alter table "user_db" rename to "user";');

    this.addSql(
      'alter table "action" add constraint "action_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );
    this.addSql(
      'alter table "action" add constraint "action_parent_action_uuid_foreign" foreign key ("parent_action_uuid") references "action" ("uuid") on update cascade on delete set null;'
    );
    this.addSql(
      'alter table "action" add constraint "action_poi_uuid_foreign" foreign key ("poi_uuid") references "poi" ("uuid") on update cascade on delete set null;'
    );
    this.addSql(
      'alter table "action" add constraint "action_station_uuid_foreign" foreign key ("station_uuid") references "station" ("uuid") on update cascade on delete set null;'
    );

    this.addSql(
      'alter table "eva" add constraint "eva_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );
    this.addSql(
      'alter table "eva" add constraint "eva_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "layer" add constraint "layer_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "log" add constraint "log_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "poi" add constraint "poi_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );
    this.addSql(
      'alter table "poi" add constraint "poi_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "preset" add constraint "preset_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );
    this.addSql(
      'alter table "preset" add constraint "preset_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "rex" add constraint "rex_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "station" add constraint "station_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );
    this.addSql(
      'alter table "station" add constraint "station_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "station_poi" add constraint "station_poi_poi_uuid_foreign" foreign key ("poi_uuid") references "poi" ("uuid") on update cascade on delete cascade;'
    );
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_station_uuid_foreign" foreign key ("station_uuid") references "station" ("uuid") on update cascade on delete cascade;'
    );

    this.addSql(
      'alter table "stm_goal" add constraint "stm_goal_objective_uuid_foreign" foreign key ("objective_uuid") references "stm_objective" ("uuid") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "stm_investigation" add constraint "stm_investigation_goal_uuid_foreign" foreign key ("goal_uuid") references "stm_goal" ("uuid") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "stm_objective" add constraint "stm_objective_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "sublayer" add constraint "sublayer_layer_uuid_foreign" foreign key ("layer_uuid") references "layer" ("uuid") on update cascade on delete no action;'
    );
    this.addSql(
      'alter table "sublayer" add constraint "sublayer_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );

    this.addSql(
      'alter table "traverse" add constraint "traverse_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade on delete no action;'
    );
  }
}
