import { Migration } from "@mikro-orm/migrations";

export class Migration20221116153901 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "action" ("id" serial primary key, "uuid" varchar(255) not null, "poi_id" int not null, "name" varchar(255) not null, "description" varchar(255) not null, "priority_override" int null, "stm_ref" jsonb null, "type" varchar(255) not null, "status" varchar(255) not null, "duration_lower" int not null, "duration_upper" int null, "inventory_items" jsonb null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );
    this.addSql('alter table "action" add constraint "action_uuid_unique" unique ("uuid");');

    this.addSql(
      'alter table "action" add constraint "action_poi_id_foreign" foreign key ("poi_id") references "poi" ("id") on update cascade;'
    );

    this.addSql('alter table "poi" drop column "actions";');
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "action" cascade;');

    this.addSql('alter table "poi" add column "actions" jsonb null default null;');
  }
}
