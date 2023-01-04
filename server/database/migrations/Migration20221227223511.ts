import { Migration } from "@mikro-orm/migrations";

export class Migration20221227223511 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "station" ("uuid" varchar(255) not null, "owner_id" int not null, "mission_id" int not null, "name" varchar(255) not null, "status" varchar(255) not null, "description" varchar(255) not null, "radius" real not null, "location" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "station_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "station_poi" ("station_uuid" varchar(255) not null, "poi_id" int not null, constraint "station_poi_pkey" primary key ("station_uuid", "poi_id"));'
    );

    this.addSql(
      'alter table "station" add constraint "station_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "station" add constraint "station_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "station_poi" add constraint "station_poi_station_uuid_foreign" foreign key ("station_uuid") references "station" ("uuid") on update cascade on delete cascade;'
    );
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_poi_id_foreign" foreign key ("poi_id") references "poi" ("id") on update cascade on delete cascade;'
    );

    this.addSql('alter table "action" drop constraint "action_poi_id_foreign";');

    this.addSql(
      'alter table "action" add column "mission_id" int not null, add column "station_uuid" varchar(255) null;'
    );
    this.addSql('alter table "action" alter column "poi_id" type int using ("poi_id"::int);');
    this.addSql('alter table "action" alter column "poi_id" drop not null;');
    this.addSql(
      'alter table "action" alter column "description" type varchar(255) using ("description"::varchar(255));'
    );
    this.addSql(
      'alter table "action" add constraint "action_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "action" add constraint "action_station_uuid_foreign" foreign key ("station_uuid") references "station" ("uuid") on update cascade on delete set null;'
    );
    this.addSql(
      'alter table "action" add constraint "action_poi_id_foreign" foreign key ("poi_id") references "poi" ("id") on update cascade on delete set null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "station_poi" drop constraint "station_poi_station_uuid_foreign";');

    this.addSql('alter table "action" drop constraint "action_station_uuid_foreign";');

    this.addSql('drop table if exists "station" cascade;');

    this.addSql('drop table if exists "station_poi" cascade;');

    this.addSql('alter table "action" drop constraint "action_mission_id_foreign";');
    this.addSql('alter table "action" drop constraint "action_poi_id_foreign";');

    this.addSql('alter table "action" alter column "poi_id" type int4 using ("poi_id"::int4);');
    this.addSql('alter table "action" alter column "poi_id" set not null;');
    this.addSql(
      'alter table "action" alter column "description" type text using ("description"::text);'
    );
    this.addSql('alter table "action" drop column "mission_id";');
    this.addSql('alter table "action" drop column "station_uuid";');
    this.addSql(
      'alter table "action" add constraint "action_poi_id_foreign" foreign key ("poi_id") references "poi" ("id") on update cascade on delete no action;'
    );
  }
}
