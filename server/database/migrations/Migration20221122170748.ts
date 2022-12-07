import { Migration } from "@mikro-orm/migrations";

export class Migration20221122170748 extends Migration {
  async up(): Promise<void> {
    this.addSql('drop table if exists "preset_history" cascade;');

    this.addSql('alter table "preset" drop constraint "preset_layer_uuid_foreign";');

    this.addSql('alter table "preset" add column "mission_id" int not null;');
    this.addSql('alter table "preset" alter column "uuid" drop default;');
    this.addSql('alter table "preset" alter column "uuid" type uuid using ("uuid"::text::uuid);');
    this.addSql(
      'alter table "preset" add constraint "preset_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );
    this.addSql('alter table "preset" rename column "layer_uuid" to "name";');
  }

  async down(): Promise<void> {
    this.addSql(
      'create table "preset_history" ("uuid" varchar(255) not null, "layer_uuid" varchar(255) not null, "config" jsonb null, "preset_id_fk_uuid" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "preset_history_pkey" primary key ("uuid"));'
    );
    this.addSql(
      'alter table "preset_history" add constraint "preset_history_preset_id_fk_uuid_unique" unique ("preset_id_fk_uuid");'
    );

    this.addSql(
      'alter table "preset_history" add constraint "preset_history_layer_uuid_foreign" foreign key ("layer_uuid") references "layer" ("uuid") on update cascade;'
    );
    this.addSql(
      'alter table "preset_history" add constraint "preset_history_preset_id_fk_uuid_foreign" foreign key ("preset_id_fk_uuid") references "preset" ("uuid") on update cascade;'
    );

    this.addSql('alter table "preset" alter column "uuid" type text using ("uuid"::text);');

    this.addSql('alter table "preset" drop constraint "preset_mission_id_foreign";');

    this.addSql(
      'alter table "preset" alter column "uuid" type varchar(255) using ("uuid"::varchar(255));'
    );
    this.addSql('alter table "preset" drop column "mission_id";');
    this.addSql('alter table "preset" rename column "name" to "layer_uuid";');
    this.addSql(
      'alter table "preset" add constraint "preset_layer_uuid_foreign" foreign key ("layer_uuid") references "layer" ("uuid") on update cascade;'
    );
  }
}
