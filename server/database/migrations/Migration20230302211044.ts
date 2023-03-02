import { Migration } from "@mikro-orm/migrations";

export class Migration20230302211044 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "station" add column "duration_lower" double precision null, add column "duration_upper" double precision null;'
    );

    this.addSql(
      'alter table "action" alter column "duration_lower" type double precision using ("duration_lower"::double precision);'
    );
    this.addSql('alter table "action" alter column "duration_lower" drop not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "station" drop column "duration_lower";');
    this.addSql('alter table "station" drop column "duration_upper";');

    this.addSql(
      'alter table "action" alter column "duration_lower" type double precision using ("duration_lower"::double precision);'
    );
    this.addSql('alter table "action" alter column "duration_lower" set not null;');
  }
}
