import { Migration } from "@mikro-orm/migrations";

export class Migration20241223230714 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "eva_db" drop constraint "eva_db_owner_id_foreign";`);

    this.addSql(`alter table "poi_db" drop constraint "poi_db_owner_id_foreign";`);

    this.addSql(`alter table "preset_db" drop constraint "preset_db_owner_id_foreign";`);

    this.addSql(`alter table "rex_db" drop constraint "rex_db_owner_id_foreign";`);

    this.addSql(`alter table "station_db" drop constraint "station_db_owner_id_foreign";`);

    this.addSql(`alter table "eva_db" alter column "owner_id" type int using ("owner_id"::int);`);
    this.addSql(`alter table "eva_db" alter column "owner_id" drop not null;`);

    this.addSql(`alter table "poi_db" alter column "owner_id" type int using ("owner_id"::int);`);
    this.addSql(`alter table "poi_db" alter column "owner_id" drop not null;`);

    this.addSql(
      `alter table "preset_db" alter column "owner_id" type int using ("owner_id"::int);`
    );
    this.addSql(`alter table "preset_db" alter column "owner_id" drop not null;`);

    this.addSql(
      `alter table "station_db" alter column "owner_id" type int using ("owner_id"::int);`
    );
    this.addSql(`alter table "station_db" alter column "owner_id" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "eva_db" alter column "owner_id" type int4 using ("owner_id"::int4);`);
    this.addSql(`alter table "eva_db" alter column "owner_id" set not null;`);
    this.addSql(
      `alter table "eva_db" add constraint "eva_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(`alter table "poi_db" alter column "owner_id" type int4 using ("owner_id"::int4);`);
    this.addSql(`alter table "poi_db" alter column "owner_id" set not null;`);
    this.addSql(
      `alter table "poi_db" add constraint "poi_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "preset_db" alter column "owner_id" type int4 using ("owner_id"::int4);`
    );
    this.addSql(`alter table "preset_db" alter column "owner_id" set not null;`);
    this.addSql(
      `alter table "preset_db" add constraint "preset_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade on delete no action;`
    );

    this.addSql(
      `alter table "rex_db" add constraint "rex_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade on delete set null;`
    );

    this.addSql(
      `alter table "station_db" alter column "owner_id" type int4 using ("owner_id"::int4);`
    );
    this.addSql(`alter table "station_db" alter column "owner_id" set not null;`);
    this.addSql(
      `alter table "station_db" add constraint "station_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade on delete no action;`
    );
  }
}
