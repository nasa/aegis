import { Migration } from "@mikro-orm/migrations";

export class Migration20221128231420 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "preset" alter column "owner_id" drop default;');
    this.addSql('alter table "preset" alter column "owner_id" type int using ("owner_id"::int);');
  }

  async down(): Promise<void> {
    this.addSql('alter table "preset" alter column "owner_id" type int using ("owner_id"::int);');
    this.addSql('alter table "preset" alter column "owner_id" set default 1;');
  }
}
