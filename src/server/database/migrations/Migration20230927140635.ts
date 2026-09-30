import { Migration } from "@mikro-orm/migrations";

export class Migration20230927140635 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "rex" alter column "description" type text using ("description"::text);'
    );
    this.addSql('alter table "rex" alter column "description" drop not null;');
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "rex" alter column "description" type text using ("description"::text);'
    );
    this.addSql('alter table "rex" alter column "description" set not null;');
  }
}
