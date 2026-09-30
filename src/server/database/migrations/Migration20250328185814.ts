import { Migration } from "@mikro-orm/migrations";

export class Migration20250328185814 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table "folder_db" ("uuid" varchar(255) not null, "mission_id" int not null, "name" text not null, "type" text not null, "items" jsonb not null, "created_at" timestamptz(3) not null, "updated_at" timestamptz(3) not null, constraint "folder_db_pkey" primary key ("uuid"));`
    );

    this.addSql(
      `alter table "folder_db" add constraint "folder_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "folder_db" cascade;`);
  }
}
