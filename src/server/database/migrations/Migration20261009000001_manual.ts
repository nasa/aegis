import { Migration } from "@mikro-orm/migrations";

/**
 * Drop the folder, layer, sublayer, preset, and STM tables. Their rows now live in the
 * Automerge mission documents. The staged migration runner copies the rows into the documents
 * before this MikroORM migration runs.
 */
export class Migration20261009000001_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`drop table if exists "stm_rule_db";`);
    this.addSql(`drop table if exists "stm_level3_db";`);
    this.addSql(`drop table if exists "stm_level2_db";`);
    this.addSql(`drop table if exists "stm_level1_db";`);
    this.addSql(`drop table if exists "sublayer_db";`);
    this.addSql(`drop table if exists "layer_db";`);
    this.addSql(`drop table if exists "preset_db";`);
    this.addSql(`drop table if exists "folder_db";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      create table "folder_db" (
        "uuid" varchar(255) not null,
        "mission_id" int not null,
        "name" text not null,
        "type" text not null,
        "items" jsonb not null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "folder_db_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "preset_db" (
        "uuid" uuid not null,
        "owner_id" int null,
        "mission_id" int not null,
        "name" text not null,
        "description" text null,
        "mission_default" boolean not null default false,
        "map_sublayer_controls" jsonb null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "layer_order" jsonb null,
        "map_circle_controls" jsonb null,
        "sun_azimuth" real null,
        "sun_enabled" boolean null default true,
        "earth_azimuth" real null,
        "earth_enabled" boolean null default true,
        "earth_as_moon" boolean null default false,
        "map_grid_control" jsonb null,
        "version" int not null default 1,
        constraint "preset_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "layer_db" (
        "uuid" uuid not null,
        "mission_id" int not null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "name" text null,
        "version" int not null default 1,
        constraint "layer_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "sublayer_db" (
        "uuid" uuid not null,
        "mission_id" int not null,
        "layer_uuid" uuid not null,
        "name" text null,
        "description" text null,
        "type" text null,
        "bounding_box" jsonb null,
        "tile_format" text null,
        "min_native_zoom" real null,
        "max_native_zoom" real null,
        "max_zoom" real null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "legend" jsonb null,
        "path" text null,
        "tile_pattern" text null,
        "is_time_based" boolean null,
        "time_layer_manifest" jsonb null,
        "version" int not null default 1,
        constraint "sublayer_pkey" primary key ("uuid"),
        constraint "sublayer_db_layer_uuid_foreign" foreign key ("layer_uuid") references "layer_db" ("uuid") on update cascade
      );
    `);
    this.addSql(`
      create table "stm_level1_db" (
        "uuid" varchar(255) not null,
        "mission_id" int not null,
        "name" text not null,
        "numbering" varchar(255) not null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "stm_objective_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "stm_level2_db" (
        "uuid" varchar(255) not null,
        "level1_uuid" varchar(255) not null,
        "name" text not null,
        "numbering" varchar(255) not null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "stm_goal_pkey" primary key ("uuid"),
        constraint "stm_level2_db_level1_uuid_foreign" foreign key ("level1_uuid") references "stm_level1_db" ("uuid") on update cascade
      );
    `);
    this.addSql(`
      create table "stm_level3_db" (
        "uuid" varchar(255) not null,
        "level2_uuid" varchar(255) not null,
        "name" text not null,
        "numbering" varchar(255) not null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "stm_investigation_pkey" primary key ("uuid"),
        constraint "stm_level3_db_level2_uuid_foreign" foreign key ("level2_uuid") references "stm_level2_db" ("uuid") on update cascade
      );
    `);
    this.addSql(`
      create table "stm_rule_db" (
        "uuid" varchar(255) not null,
        "mission_id" int not null,
        "stm_uuid" varchar(255) not null,
        "count" real not null,
        "verb_uuids" text[] not null,
        "noun_uuids" text[] not null,
        "adjective_uuids" text[] not null,
        "verb_any" boolean not null,
        "noun_any" boolean not null,
        "adjective_any" boolean not null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "stm_rule_db_pkey" primary key ("uuid")
      );
    `);
  }
}
