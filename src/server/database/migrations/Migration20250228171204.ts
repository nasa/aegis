import { Migration } from "@mikro-orm/migrations";

export class Migration20250228171204 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "traverse_db" add column "action_order_uuids" jsonb null;`);

    this.addSql(`alter table "action_db" add column "traverse_uuid" varchar(255) null;`);
    this.addSql(
      `alter table "action_db" add constraint "action_db_traverse_uuid_foreign" foreign key ("traverse_uuid") references "traverse_db" ("uuid") on update cascade on delete set null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "action_db" drop constraint "action_db_traverse_uuid_foreign";`);

    this.addSql(`alter table "action_db" drop column "traverse_uuid";`);

    this.addSql(`alter table "traverse_db" drop column "action_order_uuids";`);
  }
}
