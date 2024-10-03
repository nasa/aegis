import { Migration } from "@mikro-orm/migrations";

export class Migration20240917201049 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'create table "grid_db" ("uuid" varchar(255) not null, "mission_id" int null, "num_rows" int null, "num_cols" int null, "spacing" text null, "name" text null, "is_active_grid" boolean null, constraint "grid_db_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "grid_db" add constraint "grid_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete set null;'
    );

    this.addSql('alter table "mission_db" add column "active_grid_uuid" varchar(255) null;');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "grid_db" cascade;');

    this.addSql('alter table "mission_db" drop column "active_grid_uuid";');
  }
}
