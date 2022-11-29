import { Migration } from "@mikro-orm/migrations";

export class Migration20221123214359 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "poi" alter column "radius" type real using ("radius"::real);');

    this.addSql('alter table "action" rename column "stm_refs" to "stm_investigations";');
  }

  async down(): Promise<void> {
    this.addSql('alter table "poi" alter column "radius" type int using ("radius"::int);');

    this.addSql('alter table "action" rename column "stm_investigations" to "stm_refs";');
  }
}
