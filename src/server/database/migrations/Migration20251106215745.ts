import { Migration } from "@mikro-orm/migrations";

export class Migration20251106215745 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "eva_db" alter column "name" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "eva_db" alter column "name" set not null;`);
  }
}
