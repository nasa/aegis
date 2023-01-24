import { Migration } from "@mikro-orm/migrations";

export class Migration20230123212328 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "station" add column "action_order_uuids" jsonb null;');

    this.addSql('alter table "poi" add column "action_order_uuids" jsonb null;');

    this.addSql(
      'alter table "action" add column "parent_action_uuid" varchar(255) null, add column "parent_copy_date" timestamptz(0) null;'
    );
    this.addSql(
      'alter table "action" add constraint "action_parent_action_uuid_foreign" foreign key ("parent_action_uuid") references "action" ("uuid") on update cascade on delete set null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" drop constraint "action_parent_action_uuid_foreign";');

    this.addSql('alter table "action" drop column "parent_action_uuid";');
    this.addSql('alter table "action" drop column "parent_copy_date";');

    this.addSql('alter table "poi" drop column "action_order_uuids";');

    this.addSql('alter table "station" drop column "action_order_uuids";');
  }
}
