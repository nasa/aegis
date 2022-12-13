import { Migration } from "@mikro-orm/migrations";

export class Migration20221212232419 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "layer" alter column "uuid" drop default;');
    this.addSql('alter table "layer" alter column "uuid" type uuid using ("uuid"::text::uuid);');
    this.addSql('alter table "layer" rename column "config" to "layer_config";');

    this.addSql(
      'alter table "preset" alter column "description" type varchar(255) using ("description"::varchar(255));'
    );
    this.addSql('alter table "preset" alter column "description" drop not null;');
    this.addSql('alter table "preset" rename column "config" to "layer_controls";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "layer" alter column "uuid" type text using ("uuid"::text);');

    this.addSql('alter table "layer" alter column "uuid" type varchar using ("uuid"::varchar);');
    this.addSql('alter table "layer" rename column "layer_config" to "config";');

    this.addSql(
      'alter table "preset" alter column "description" type varchar using ("description"::varchar);'
    );
    this.addSql('alter table "preset" alter column "description" set not null;');
    this.addSql('alter table "preset" rename column "layer_controls" to "config";');
  }
}
