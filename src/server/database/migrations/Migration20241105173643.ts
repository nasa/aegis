import { Migration } from "@mikro-orm/migrations";

export class Migration20241105173643 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop table if exists "log_db" cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `create table "log_db" ("uuid" varchar(255) not null, "mission_id" int4 not null, "type" varchar(255) not null, "payload_json" jsonb not null, "created_at" timestamptz(3) not null, constraint "log_pkey" primary key ("uuid"));`
    );
    this.addSql(
      `alter table "log_db" add constraint "log_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );
  }
}
