import { Migration } from "@mikro-orm/migrations";

export class Migration20230104154749 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "station_poi" drop constraint "station_poi_poi_id_foreign";');

    this.addSql('alter table "action" drop constraint "action_poi_id_foreign";');

    this.addSql('alter table "poi" drop constraint "poi_uuid_unique";');
    this.addSql('alter table "poi" drop constraint "poi_pkey";');
    this.addSql('alter table "poi" drop column "id";');
    this.addSql('alter table "poi" add constraint "poi_pkey" primary key ("uuid");');

    this.addSql('alter table "station_poi" add column "poi_uuid" varchar(255) not null;');
    this.addSql('alter table "station_poi" drop constraint "station_poi_pkey";');
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_poi_uuid_foreign" foreign key ("poi_uuid") references "poi" ("uuid") on update cascade on delete cascade;'
    );
    this.addSql('alter table "station_poi" drop column "poi_id";');
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_pkey" primary key ("station_uuid", "poi_uuid");'
    );

    this.addSql('alter table "action" add column "poi_uuid" varchar(255) null;');
    this.addSql(
      'alter table "action" add constraint "action_poi_uuid_foreign" foreign key ("poi_uuid") references "poi" ("uuid") on update cascade on delete set null;'
    );
    this.addSql('alter table "action" drop column "poi_id";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "station_poi" drop constraint "station_poi_poi_uuid_foreign";');

    this.addSql('alter table "action" drop constraint "action_poi_uuid_foreign";');

    this.addSql('alter table "poi" add column "id" serial;');
    this.addSql('alter table "poi" drop constraint "poi_pkey";');
    this.addSql('alter table "poi" add constraint "poi_uuid_unique" unique ("uuid");');
    this.addSql('alter table "poi" add constraint "poi_pkey" primary key ("id");');

    this.addSql('alter table "station_poi" add column "poi_id" int not null;');
    this.addSql('alter table "station_poi" drop constraint "station_poi_pkey";');
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_poi_id_foreign" foreign key ("poi_id") references "poi" ("id") on update cascade on delete cascade;'
    );
    this.addSql('alter table "station_poi" drop column "poi_uuid";');
    this.addSql(
      'alter table "station_poi" add constraint "station_poi_pkey" primary key ("station_uuid", "poi_id");'
    );

    this.addSql('alter table "action" add column "poi_id" int null;');
    this.addSql(
      'alter table "action" add constraint "action_poi_id_foreign" foreign key ("poi_id") references "poi" ("id") on update cascade on delete set null;'
    );
    this.addSql('alter table "action" drop column "poi_uuid";');
  }
}
