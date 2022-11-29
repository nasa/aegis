import { Migration } from "@mikro-orm/migrations";

export class Migration20221118021642 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "action" alter column "duration_lower" type double precision using ("duration_lower"::double precision);'
    );
    this.addSql(
      'alter table "action" alter column "duration_upper" type double precision using ("duration_upper"::double precision);'
    );
    this.addSql('alter table "action" rename column "stm_ref" to "stm_refs";');
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "action" alter column "duration_lower" type int4 using ("duration_lower"::int4);'
    );
    this.addSql(
      'alter table "action" alter column "duration_upper" type int4 using ("duration_upper"::int4);'
    );
    this.addSql('alter table "action" rename column "stm_refs" to "stm_ref";');
  }
}
