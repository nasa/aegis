import { Migration } from "@mikro-orm/migrations";

export class Migration20230919185153 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "log" ("uuid" varchar(255) not null, "mission_id" int not null, "type" varchar(255) not null, "payload_json" jsonb not null, "created_at" timestamptz(0) not null, constraint "log_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "log" add constraint "log_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "log" cascade;');
  }
}
