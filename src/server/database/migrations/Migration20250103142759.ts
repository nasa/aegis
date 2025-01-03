import { Migration } from "@mikro-orm/migrations";

export class Migration20250103142759 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "grid_db" alter column "spacing" type int using ("spacing"::int);`);

    this.addSql(
      `alter table "sublayer_db" drop column "is_time_based", drop column "time_layer_manifest";`
    );

    this.addSql(
      `alter table "eva_db" drop column "use_datetime", drop column "date", drop column "time";`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "eva_db" add column "use_datetime" bool null, add column "date" varchar(255) null, add column "time" varchar(255) null;`
    );

    this.addSql(`alter table "grid_db" alter column "spacing" type text using ("spacing"::text);`);

    this.addSql(
      `alter table "sublayer_db" add column "is_time_based" bool null, add column "time_layer_manifest" jsonb null;`
    );
  }
}
