import { Migration } from "@mikro-orm/migrations";

export class Migration20221208221448 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "layer" alter column "uuid" drop default;');
    this.addSql('alter table "layer" alter column "uuid" type uuid using ("uuid"::text::uuid);');
  }

  async down(): Promise<void> {
    this.addSql('alter table "layer" alter column "uuid" type text using ("uuid"::text);');

    this.addSql('alter table "layer" alter column "uuid" type varchar using ("uuid"::varchar);');
  }
}
