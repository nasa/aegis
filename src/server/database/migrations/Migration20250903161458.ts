import { Migration } from "@mikro-orm/migrations";

export class Migration20250903161458 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "mission_db" add column "using_lgrscoordinates" boolean not null default false;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "mission_db" drop column "using_lgrscoordinates";`);
  }
}
