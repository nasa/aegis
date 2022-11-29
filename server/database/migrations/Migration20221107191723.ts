import { Migration } from "@mikro-orm/migrations";

export class Migration20221107191723 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "poi" ("id" serial primary key, "owner_id" int not null, "mission_id" int not null, "name" varchar(255) not null, "description" varchar(255) not null, "actions" jsonb null, "priority_override" int null, "radius" int not null, "uuid" varchar(255) not null, "location" jsonb null, "color" jsonb null, "tags" jsonb null, "status" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null);'
    );

    this.addSql(
      'alter table "poi" add constraint "poi_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
    this.addSql(
      'alter table "poi" add constraint "poi_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql('alter table "user" drop constraint if exists "user_permission_check";');

    this.addSql(
      'alter table "user" alter column "permission" type varchar(255) using ("permission"::varchar(255));'
    );

    this.addSql('alter table "preset" add column "owner_id" int not null default 1;');
    this.addSql(
      'alter table "preset" add constraint "preset_owner_id_foreign" foreign key ("owner_id") references "user" ("id") on update cascade;'
    );
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "poi" cascade;');

    this.addSql('alter table "preset" drop constraint "preset_owner_id_foreign";');

    this.addSql('alter table "preset" drop column "owner_id";');

    this.addSql(
      'alter table "user" alter column "permission" type text using ("permission"::text);'
    );
    this.addSql(
      'alter table "user" add constraint "user_permission_check" check ("permission" in (\'admin\', \'user\'));'
    );
  }
}
