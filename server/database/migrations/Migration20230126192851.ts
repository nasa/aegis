import { Migration } from "@mikro-orm/migrations";

export class Migration20230126192851 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "mission" ("id" serial primary key, "name" varchar(255) not null, "config" jsonb null, "version" int not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );

    this.addSql(
      'create table "layer" ("uuid" uuid not null, "mission_id" int not null, "layer_config" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "layer_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "stm_objective" ("uuid" varchar(255) not null, "mission_id" int not null, "name" varchar(255) not null, "numbering" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "stm_objective_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "stm_goal" ("uuid" varchar(255) not null, "objective_uuid" varchar(255) not null, "name" varchar(255) not null, "numbering" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "stm_goal_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "stm_investigation" ("uuid" varchar(255) not null, "goal_uuid" varchar(255) not null, "name" varchar(255) not null, "numbering" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "stm_investigation_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "user" ("id" serial primary key, "username" varchar(255) not null, "email" varchar(255) not null, "password" varchar(255) not null, "permission" varchar(255) not null, "token" varchar(2048) null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );

    this.addSql(
      'create table "station" ("uuid" varchar(255) not null, "owner_id" int not null, "mission_id" int not null, "name" varchar(255) not null, "status" varchar(255) not null, "description" varchar(255) not null, "radius" real not null, "location" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "station_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "preset" ("uuid" uuid not null, "owner_id" int not null, "mission_id" int not null, "name" varchar(255) not null, "description" varchar(255) null, "mission_preset" boolean not null default false, "mission_preset_default" boolean not null default false, "layer_controls" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "preset_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "poi" ("uuid" varchar(255) not null, "owner_id" int not null, "mission_id" int not null, "name" varchar(255) not null, "description" text not null, "priority_override" int null, "radius" real not null, "location" jsonb null, "color" jsonb null, "tags" jsonb null, "status" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "poi_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "station_poi" ("station_uuid" varchar(255) not null, "poi_uuid" varchar(255) not null, constraint "station_poi_pkey" primary key ("station_uuid", "poi_uuid"));'
    );

    this.addSql(
      'create table "action" ("uuid" varchar(255) not null, "mission_id" int not null, "poi_uuid" varchar(255) null, "station_uuid" varchar(255) null, "name" varchar(255) not null, "priority_override" int null, "stm_uuid_refs" jsonb null, "type" varchar(255) not null, "description" varchar(255) not null, "duration_lower" double precision not null, "duration_upper" double precision null, "inventory_items" jsonb null, "status" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "action_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "layer" add constraint "layer_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "stm_objective" add constraint "stm_objective_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "stm_goal" add constraint "stm_goal_objective_uuid_foreign" foreign key ("objective_uuid") references "stm_objective" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "stm_investigation" add constraint "stm_investigation_goal_uuid_foreign" foreign key ("goal_uuid") references "stm_goal" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "station" add constraint "station_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "station" add constraint "station_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "preset" add constraint "preset_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "preset" add constraint "preset_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "poi" add constraint "poi_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "poi" add constraint "poi_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "station_poi" add constraint "station_poi_station_uuid_foreign" foreign key ("station_uuid") references "station" ("uuid") on update cascade on delete cascade;'
    );
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_poi_uuid_foreign" foreign key ("poi_uuid") references "poi" ("uuid") on update cascade on delete cascade;'
    );

    this.addSql(
      'alter table "action" add constraint "action_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "action" add constraint "action_poi_uuid_foreign" foreign key ("poi_uuid") references "poi" ("uuid") on update cascade on delete set null;'
    );
    this.addSql(
      'alter table "action" add constraint "action_station_uuid_foreign" foreign key ("station_uuid") references "station" ("uuid") on update cascade on delete set null;'
    );

    this.addSql('drop table if exists "preset_history" cascade;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "layer" drop constraint "layer_mission_id_foreign";');

    this.addSql('alter table "stm_objective" drop constraint "stm_objective_mission_id_foreign";');

    this.addSql('alter table "station" drop constraint "station_mission_id_foreign";');

    this.addSql('alter table "preset" drop constraint "preset_mission_id_foreign";');

    this.addSql('alter table "poi" drop constraint "poi_mission_id_foreign";');

    this.addSql('alter table "action" drop constraint "action_mission_id_foreign";');

    this.addSql('alter table "stm_goal" drop constraint "stm_goal_objective_uuid_foreign";');

    this.addSql(
      'alter table "stm_investigation" drop constraint "stm_investigation_goal_uuid_foreign";'
    );

    this.addSql('alter table "station" drop constraint "station_owner_id_foreign";');

    this.addSql('alter table "preset" drop constraint "preset_owner_id_foreign";');

    this.addSql('alter table "poi" drop constraint "poi_owner_id_foreign";');

    this.addSql('alter table "station_poi" drop constraint "station_poi_station_uuid_foreign";');

    this.addSql('alter table "action" drop constraint "action_station_uuid_foreign";');

    this.addSql('alter table "station_poi" drop constraint "station_poi_poi_uuid_foreign";');

    this.addSql('alter table "action" drop constraint "action_poi_uuid_foreign";');

    this.addSql(
      'create table "preset_history" ("uuid" varchar not null default null, "layer_uuid" varchar not null default null, "config" jsonb null default null, "preset_id_fk_uuid" varchar not null default null, "created_at" timestamptz not null default null, "updated_at" timestamptz not null default null, constraint "preset_history_pkey" primary key ("uuid"));'
    );
    this.addSql(
      'alter table "preset_history" add constraint "preset_history_preset_id_fk_uuid_unique" unique ("preset_id_fk_uuid");'
    );

    this.addSql('drop table if exists "mission" cascade;');

    this.addSql('drop table if exists "layer" cascade;');

    this.addSql('drop table if exists "stm_objective" cascade;');

    this.addSql('drop table if exists "stm_goal" cascade;');

    this.addSql('drop table if exists "stm_investigation" cascade;');

    this.addSql('drop table if exists "user" cascade;');

    this.addSql('drop table if exists "station" cascade;');

    this.addSql('drop table if exists "preset" cascade;');

    this.addSql('drop table if exists "poi" cascade;');

    this.addSql('drop table if exists "station_poi" cascade;');

    this.addSql('drop table if exists "action" cascade;');
  }
}
