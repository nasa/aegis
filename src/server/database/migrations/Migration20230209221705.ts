import { Migration } from "@mikro-orm/migrations";

export class Migration20230209221705 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "traverse" ("uuid" varchar(255) not null, "mission_id" int not null, "name" varchar(255) not null, "location" jsonb null, "duration" double precision null, "description" varchar(255) null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "traverse_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "eva" ("uuid" varchar(255) not null, "owner_id" int not null, "mission_id" int not null, "name" varchar(255) not null, "status" varchar(255) not null, "sequence" jsonb null, "description" varchar(255) null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "eva_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "traverse" add constraint "traverse_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "eva" add constraint "eva_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "eva" add constraint "eva_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "traverse" cascade;');

    this.addSql('drop table if exists "eva" cascade;');
  }
}
