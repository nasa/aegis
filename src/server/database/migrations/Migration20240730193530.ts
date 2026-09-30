import { Migration } from "@mikro-orm/migrations";

export class Migration20240730193530 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "rex_db" add column "owner_id" int null;');
    this.addSql(
      'alter table "rex_db" add constraint "rex_db_owner_id_foreign" foreign key ("owner_id") references "user_db" ("id") on update cascade on delete set null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "rex_db" drop constraint "rex_db_owner_id_foreign";');

    this.addSql('alter table "rex_db" drop column "owner_id";');
  }
}
