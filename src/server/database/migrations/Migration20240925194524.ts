import { Migration } from "@mikro-orm/migrations";

export class Migration20240925194524 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'create table "stm_rule_db" ("uuid" varchar(255) not null, "mission_id" int not null, "stm_uuid" varchar(255) not null, "count" real not null, "verb_uuids" text[] not null, "noun_uuids" text[] not null, "adjective_uuids" text[] not null, "verb_any" boolean not null, "noun_any" boolean not null, "adjective_any" boolean not null, "created_at" timestamptz(3) not null, "updated_at" timestamptz(3) not null, constraint "stm_rule_db_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "stm_rule_db" add constraint "stm_rule_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;'
    );
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "stm_rule_db" cascade;');
  }
}
