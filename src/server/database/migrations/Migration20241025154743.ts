import { Migration } from "@mikro-orm/migrations";

export class Migration20241025154743 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "mission_db" add column "is_archived" boolean not null default false;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "mission_db" drop column "is_archived";`);
  }
}
