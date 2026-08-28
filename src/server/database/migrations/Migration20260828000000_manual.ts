import { Migration } from "@mikro-orm/migrations";

/**
 * Drop relational tables whose data now lives exclusively in Automerge mission documents.
 * The staged migration runner applies and records the legacy-data migrations before this
 * final MikroORM migration runs.
 */
export class Migration20260828000000_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`drop table if exists "action_db";`);
    this.addSql(`drop table if exists "station_db_poi";`);
    this.addSql(`drop table if exists "eva_db";`);
    this.addSql(`drop table if exists "rex_db";`);
    this.addSql(`drop table if exists "station_db";`);
    this.addSql(`drop table if exists "poi_db";`);
    this.addSql(`drop table if exists "traverse_db";`);
    this.addSql(`drop table if exists "grid_db";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      create table "eva_db" (
        "uuid" varchar(255) not null,
        "ref_uuid" varchar(255) not null default uuid_generate_v4(),
        "mission_id" int not null,
        "name" text not null,
        "status" varchar(255) not null,
        "sequence" jsonb null,
        "description" text not null,
        "duration" real null,
        "traverse_rate" real null,
        "egress_duration" real null,
        "ingress_duration" real null,
        "egress_location_uuid" varchar(255) null,
        "ingress_location_uuid" varchar(255) null,
        "traverse_color" varchar(255) null,
        "owner_id" int null,
        "datetime" varchar(255) null,
        "show_edit_warning" boolean not null default false,
        "edit_warning_msg" text null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "eva_db_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "rex_db" (
        "uuid" varchar(255) not null,
        "mission_id" int not null,
        "name" text not null,
        "description" text null,
        "pet_start_stop_timestamp" varchar(255) null,
        "pet_value_at_start_stop" varchar(255) null,
        "pet_running" boolean null,
        "eva_uuid" varchar(255) not null,
        "is_running" boolean null,
        "pos_entries" jsonb null,
        "pos_types" jsonb null,
        "pos_sources" jsonb null,
        "station_entries" jsonb null,
        "traverse_entries" jsonb null,
        "action_entries" jsonb null,
        "xgress_entries" jsonb null,
        "owner_id" int null,
        "maestro_controlled" boolean not null default false,
        "maestro_event_id" varchar(255) null,
        "maestro_event_url" varchar(255) null,
        "maestro_activity_properties_by_ref_uuid" jsonb null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "rex_db_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "station_db" (
        "uuid" varchar(255) not null,
        "ref_uuid" varchar(255) not null default uuid_generate_v4(),
        "mission_id" int not null,
        "name" text not null,
        "status" varchar(255) not null,
        "description" text not null,
        "radius" real not null,
        "location" jsonb null,
        "elevation" real null,
        "walkback_path" jsonb null,
        "walkback_path_segment_distances" jsonb null,
        "walkback_path_segment_elevations" jsonb null,
        "walkback_traverse_rate" real null,
        "action_order_uuids" jsonb null,
        "duration" real null,
        "icon" varchar(255) null,
        "owner_id" int null,
        "map_circle_controls" jsonb not null default '{}',
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "station_db_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "poi_db" (
        "uuid" varchar(255) not null,
        "mission_id" int not null,
        "name" text not null,
        "description" text not null,
        "priority_override" int null,
        "radius" real not null,
        "location" jsonb null,
        "elevation" real null,
        "icon" varchar(255) null,
        "tags" jsonb null,
        "status" varchar(255) not null,
        "action_order_uuids" jsonb null,
        "owner_id" int null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "poi_db_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "traverse_db" (
        "uuid" varchar(255) not null,
        "ref_uuid" varchar(255) not null default uuid_generate_v4(),
        "mission_id" int not null,
        "name" text not null,
        "path" jsonb null,
        "path_segment_distances" jsonb null,
        "path_segment_elevations" jsonb null,
        "duration" real null,
        "description" text not null,
        "status" varchar(255) null,
        "traverse_rate" real null default null,
        "color" varchar(255) null,
        "action_order_uuids" jsonb null,
        "created_at" timestamp(3) not null,
        "updated_at" timestamp(3) not null,
        "version" int not null default 1,
        constraint "traverse_db_pkey" primary key ("uuid")
      );
    `);
    this.addSql(`
      create table "action_db" (
        "uuid" varchar(255) not null,
        "ref_uuid" varchar(255) not null default uuid_generate_v4(),
        "mission_id" int not null,
        "poi_uuid" varchar(255) null,
        "station_uuid" varchar(255) null,
        "traverse_uuid" varchar(255) null,
        "parent_action_uuid" varchar(255) null,
        "parent_copy_date" double precision null,
        "name" text not null,
        "priority" int null,
        "stm_priorities" jsonb null,
        "type" varchar(255) not null,
        "stm_action" boolean not null default false,
        "action_definition" jsonb null,
        "description" text not null,
        "description_task" text null,
        "icon" varchar(255) null,
        "location" jsonb null,
        "elevation" real null,
        "duration" real null,
        "equipment_items_usage" jsonb null,
        "geographic_units_usage" jsonb null,
        "mass" real null,
        "status" varchar(255) not null,
        "enabled" boolean not null default true,
        "crew_assigned" jsonb null,
        "created_at" double precision not null,
        "updated_at" double precision not null,
        "version" int not null default 1,
        constraint "action_db_pkey" primary key ("uuid"),
        constraint "action_db_poi_uuid_foreign" foreign key ("poi_uuid") references "poi_db" ("uuid") on update cascade on delete set null,
        constraint "action_db_station_uuid_foreign" foreign key ("station_uuid") references "station_db" ("uuid") on update cascade on delete set null,
        constraint "action_db_traverse_uuid_foreign" foreign key ("traverse_uuid") references "traverse_db" ("uuid") on update cascade on delete set null,
        constraint "action_db_parent_action_uuid_foreign" foreign key ("parent_action_uuid") references "action_db" ("uuid") on update cascade on delete set null
      );
    `);
    this.addSql(`
      create table "station_db_poi" (
        "station_db_uuid" varchar(255) not null,
        "poi_db_uuid" varchar(255) not null,
        constraint "station_db_poi_pkey" primary key ("station_db_uuid", "poi_db_uuid"),
        constraint "station_db_poi_station_db_uuid_foreign" foreign key ("station_db_uuid") references "station_db" ("uuid") on update cascade on delete cascade,
        constraint "station_db_poi_poi_db_uuid_foreign" foreign key ("poi_db_uuid") references "poi_db" ("uuid") on update cascade on delete cascade
      );
    `);
    this.addSql(`
      create table "grid_db" (
        "uuid" varchar(255) not null,
        "mission_id" int null,
        "num_rows" int null,
        "num_cols" int null,
        "spacing" int null,
        "name" text null,
        "file_name" text null,
        "is_active_grid" boolean null,
        "version" int not null default 1,
        constraint "grid_db_pkey" primary key ("uuid")
      );
    `);
  }
}
