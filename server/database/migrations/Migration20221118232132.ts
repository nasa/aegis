import { Migration } from "@mikro-orm/migrations";

export class Migration20221118232132 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "poi" alter column "description" type text using ("description"::text);'
    );

    this.addSql(
      'alter table "action" alter column "description" type text using ("description"::text);'
    );
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "poi" alter column "description" type varchar(255) using ("description"::varchar(255));'
    );

    this.addSql(
      'alter table "action" alter column "description" type varchar(255) using ("description"::varchar(255));'
    );
  }
}
