import { Migration } from "@mikro-orm/migrations";

export class Migration20221206214029 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "preset" add column "description" varchar(255) not null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "preset" drop column "description";');
  }
}
