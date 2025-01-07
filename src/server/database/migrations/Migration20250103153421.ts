import { Migration } from "@mikro-orm/migrations";

export class Migration20250103153421 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "grid_db" alter column "spacing" type int using ("spacing"::int);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "grid_db" alter column "spacing" type text using ("spacing"::text);`);
  }
}
