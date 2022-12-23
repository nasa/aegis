import { Migration } from "@mikro-orm/migrations";

export class Migration20221013203932 extends Migration {
  async up(): Promise<void> {
    this.addSql("drop extension if exists postgis_topology");

    this.addSql(
      'create table "mission" ("id" serial primary key, "name" varchar(255) not null, "config" jsonb null, "version" int not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );

    this.addSql(
      'create table "layer" ("uuid" varchar(255) not null, "mission_id" int not null, "config" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "layer_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "preset" ("uuid" varchar(255) not null, "layer_uuid" varchar(255) not null, "config" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "preset_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "preset_history" ("uuid" varchar(255) not null, "layer_uuid" varchar(255) not null, "config" jsonb null, "preset_id_fk_uuid" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "preset_history_pkey" primary key ("uuid"));'
    );
    this.addSql(
      'alter table "preset_history" add constraint "preset_history_preset_id_fk_uuid_unique" unique ("preset_id_fk_uuid");'
    );

    this.addSql(
      'create table "user" ("id" serial primary key, "username" varchar(255) not null, "email" varchar(255) not null, "password" varchar(255) not null, "permission" text check ("permission" in (\'admin\', \'user\')) not null, "token" varchar(2048) null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );

    this.addSql(
      'alter table "layer" add constraint "layer_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "preset" add constraint "preset_layer_uuid_foreign" foreign key ("layer_uuid") references "layer" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "preset_history" add constraint "preset_history_layer_uuid_foreign" foreign key ("layer_uuid") references "layer" ("uuid") on update cascade;'
    );
    this.addSql(
      'alter table "preset_history" add constraint "preset_history_preset_id_fk_uuid_foreign" foreign key ("preset_id_fk_uuid") references "preset" ("uuid") on update cascade;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "layer" drop constraint "layer_mission_id_foreign";');

    this.addSql('alter table "preset" drop constraint "preset_layer_uuid_foreign";');

    this.addSql(
      'alter table "preset_history" drop constraint "preset_history_layer_uuid_foreign";'
    );

    this.addSql(
      'alter table "preset_history" drop constraint "preset_history_preset_id_fk_uuid_foreign";'
    );

    this.addSql('drop table if exists "mission" cascade;');

    this.addSql('drop table if exists "layer" cascade;');

    this.addSql('drop table if exists "preset" cascade;');

    this.addSql('drop table if exists "preset_history" cascade;');

    this.addSql('drop table if exists "user" cascade;');
  }
}
