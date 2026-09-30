import { Migration } from "@mikro-orm/migrations";

export class Migration20260302221409 extends Migration {
  override async up(): Promise<void> {
    // Backfill nulls to empty strings before enforcing NOT NULL constraints
    this.addSql(`update "mission_db" set "description" = '' where "description" is null;`);
    this.addSql(`update "eva_db" set "description" = '' where "description" is null;`);
    this.addSql(`update "eva_db" set "name" = '' where "name" is null;`);
    this.addSql(`update "traverse_db" set "description" = '' where "description" is null;`);

    // update mission description
    this.addSql(
      `alter table "mission_db" alter column "description" type text using ("description"::text);`
    );
    this.addSql(`alter table "mission_db" alter column "description" set not null;`);

    // update eva name and description
    this.addSql(
      `alter table "eva_db" alter column "description" type text using ("description"::text);`
    );
    this.addSql(`alter table "eva_db" alter column "description" set not null;`);
    this.addSql(`alter table "eva_db" alter column "name" type text using ("name"::text);`);
    this.addSql(`alter table "eva_db" alter column "name" set not null;`);

    // update traverse description
    this.addSql(
      `alter table "traverse_db" alter column "description" type text using ("description"::text);`
    );
    this.addSql(`alter table "traverse_db" alter column "description" set not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "eva_db" alter column "description" type text using ("description"::text);`
    );
    this.addSql(`alter table "eva_db" alter column "description" drop not null;`);
    this.addSql(`alter table "eva_db" alter column "name" type text using ("name"::text);`);
    this.addSql(`alter table "eva_db" alter column "name" drop not null;`);

    this.addSql(
      `alter table "mission_db" alter column "description" type text using ("description"::text);`
    );
    this.addSql(`alter table "mission_db" alter column "description" drop not null;`);

    this.addSql(
      `alter table "traverse_db" alter column "description" type text using ("description"::text);`
    );
    this.addSql(`alter table "traverse_db" alter column "description" drop not null;`);
  }
}
