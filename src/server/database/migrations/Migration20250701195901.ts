import { Migration } from "@mikro-orm/migrations";

export class Migration20250701195901 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`ALTER TABLE "user_db" RENAME TO "app_user_db";`);
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "app_user_db" RENAME TO "user_db";`);
  }
}
