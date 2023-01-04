import { Migration } from "@mikro-orm/migrations";

export class Migration20221228173854 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "action" drop constraint "action_uuid_unique";');
    this.addSql('alter table "action" drop constraint "action_pkey";');
    this.addSql('alter table "action" drop column "id";');
    this.addSql('alter table "action" add constraint "action_pkey" primary key ("uuid");');
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" add column "id" serial;');
    this.addSql('alter table "action" drop constraint "action_pkey";');
    this.addSql('alter table "action" add constraint "action_uuid_unique" unique ("uuid");');
    this.addSql('alter table "action" add constraint "action_pkey" primary key ("id");');
  }
}
