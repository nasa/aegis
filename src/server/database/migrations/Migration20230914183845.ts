import { Migration } from "@mikro-orm/migrations";

export class Migration20230914183845 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "rex" ("uuid" varchar(255) not null, "mission_id" int not null, "name" text not null, "description" text not null, "pet_start_stop_timestamp" varchar(255) null, "pet_value_at_start_stop" varchar(255) null, "pet_running" boolean null, "selected_rex_eva_uuid" varchar(255) null, "rex_running" boolean null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "rex_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "rex" add constraint "rex_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql('alter table "traverse" add column "rex_status" varchar(255) null;');

    this.addSql('alter table "station" add column "rex_status" varchar(255) null;');

    this.addSql('alter table "action" add column "rex_status" varchar(255) null;');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "rex" cascade;');

    this.addSql('alter table "action" drop column "rex_status";');

    this.addSql('alter table "station" drop column "rex_status";');

    this.addSql('alter table "traverse" drop column "rex_status";');
  }
}
