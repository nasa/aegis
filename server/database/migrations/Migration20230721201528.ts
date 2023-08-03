import { Migration } from "@mikro-orm/migrations";

export class Migration20230721201528 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "sublayer" ("uuid" uuid not null, "mission_id" int not null, "layer_uuid" uuid not null, "name" text null, "description" text null, "url" text null, "type" text null, "file_path" text null, "bounding_box" jsonb null, "tile_format" text null, "min_zoom" double precision null, "max_native_zoom" double precision null, "max_zoom" double precision null, "color" text null, "opacity" double precision null, "fill_color" text null, "fill_opacity" double precision null, "weight" double precision null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "sublayer_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "sublayer" add constraint "sublayer_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "sublayer" add constraint "sublayer_layer_uuid_foreign" foreign key ("layer_uuid") references "layer" ("uuid") on update cascade;'
    );

    this.addSql('alter table "layer" add column "name" text null;');
    this.addSql(
      'alter table "preset" rename column "map_layer_controls" to "map_sublayer_controls";'
    );
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "sublayer" cascade;');

    this.addSql('alter table "layer" drop column "name";');
    this.addSql(
      'alter table "preset" rename column "map_sublayer_controls" to "map_layer_controls";'
    );
  }
}
