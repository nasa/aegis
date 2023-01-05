import { Migration } from "@mikro-orm/migrations";

export class Migration20230105153512 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "preset" drop constraint "preset_uuid_unique";');
    this.addSql('alter table "preset" drop constraint "preset_pkey";');
    this.addSql('alter table "preset" drop column "id";');
    this.addSql('alter table "preset" add constraint "preset_pkey" primary key ("uuid");');
  }

  async down(): Promise<void> {
    this.addSql('alter table "preset" add column "id" serial;');
    this.addSql('alter table "preset" drop constraint "preset_pkey";');
    this.addSql('alter table "preset" add constraint "preset_uuid_unique" unique ("uuid");');
    this.addSql('alter table "preset" add constraint "preset_pkey" primary key ("id");');
  }
}
