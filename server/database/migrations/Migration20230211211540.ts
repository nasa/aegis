import { Migration } from "@mikro-orm/migrations";

export class Migration20230211211540 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "traverse" add column "duration_upper" double precision null, add column "status" varchar(255) null;'
    );
    this.addSql('alter table "traverse" rename column "duration" to "duration_lower";');

    this.addSql('alter table "eva" add column "max_duration" double precision null;');
  }

  async down(): Promise<void> {
    this.addSql('alter table "eva" drop column "max_duration";');

    this.addSql('alter table "traverse" add column "duration" float8 null default null;');
    this.addSql('alter table "traverse" drop column "duration_lower";');
    this.addSql('alter table "traverse" drop column "duration_upper";');
    this.addSql('alter table "traverse" drop column "status";');
  }
}
