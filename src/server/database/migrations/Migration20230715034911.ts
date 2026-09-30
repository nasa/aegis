import { Migration } from "@mikro-orm/migrations";

export class Migration20230715034911 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" add column "geographic_units" jsonb null;');

    this.addSql(
      'alter table "user" alter column "is_admin" type boolean using ("is_admin"::boolean);'
    );
    this.addSql('alter table "user" alter column "is_admin" set default false;');

    this.addSql(
      'alter table "action" add column "geographic_units_usage" jsonb null, add column "crew_assigned" jsonb null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" drop column "geographic_units_usage";');
    this.addSql('alter table "action" drop column "crew_assigned";');

    this.addSql('alter table "mission" drop column "geographic_units";');

    this.addSql('alter table "user" alter column "is_admin" drop default;');
    this.addSql('alter table "user" alter column "is_admin" type bool using ("is_admin"::bool);');
  }
}
