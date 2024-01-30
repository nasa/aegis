import { Migration } from "@mikro-orm/migrations";

export class Migration20230502211748 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "mission" alter column "name" type text using ("name"::text);');

    this.addSql('alter table "stm_objective" alter column "name" type text using ("name"::text);');

    this.addSql('alter table "stm_goal" alter column "name" type text using ("name"::text);');

    this.addSql(
      'alter table "stm_investigation" alter column "name" type text using ("name"::text);'
    );

    this.addSql('alter table "traverse" alter column "name" type text using ("name"::text);');
    this.addSql(
      'alter table "traverse" alter column "description" type text using ("description"::text);'
    );
    this.addSql(
      'alter table "traverse" alter column "traverse_rate" type double precision using ("traverse_rate"::double precision);'
    );

    this.addSql('alter table "user" alter column "username" type text using ("username"::text);');
    this.addSql('alter table "user" alter column "email" type text using ("email"::text);');
    this.addSql('alter table "user" alter column "password" type text using ("password"::text);');

    this.addSql('alter table "station" alter column "name" type text using ("name"::text);');
    this.addSql(
      'alter table "station" alter column "description" type text using ("description"::text);'
    );

    this.addSql('alter table "preset" alter column "name" type text using ("name"::text);');
    this.addSql(
      'alter table "preset" alter column "description" type text using ("description"::text);'
    );

    this.addSql('alter table "poi" alter column "name" type text using ("name"::text);');

    this.addSql('alter table "action" alter column "name" type text using ("name"::text);');
    this.addSql(
      'alter table "action" alter column "description" type text using ("description"::text);'
    );

    this.addSql('alter table "eva" alter column "name" type text using ("name"::text);');
    this.addSql(
      'alter table "eva" alter column "description" type text using ("description"::text);'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "action" alter column "name" type varchar using ("name"::varchar);');
    this.addSql(
      'alter table "action" alter column "description" type varchar using ("description"::varchar);'
    );

    this.addSql('alter table "eva" alter column "name" type varchar using ("name"::varchar);');
    this.addSql(
      'alter table "eva" alter column "description" type varchar using ("description"::varchar);'
    );

    this.addSql('alter table "mission" alter column "name" type varchar using ("name"::varchar);');

    this.addSql('alter table "poi" alter column "name" type varchar using ("name"::varchar);');

    this.addSql('alter table "preset" alter column "name" type varchar using ("name"::varchar);');
    this.addSql(
      'alter table "preset" alter column "description" type varchar using ("description"::varchar);'
    );

    this.addSql('alter table "station" alter column "name" type varchar using ("name"::varchar);');
    this.addSql(
      'alter table "station" alter column "description" type varchar using ("description"::varchar);'
    );

    this.addSql('alter table "stm_goal" alter column "name" type varchar using ("name"::varchar);');

    this.addSql(
      'alter table "stm_investigation" alter column "name" type varchar using ("name"::varchar);'
    );

    this.addSql(
      'alter table "stm_objective" alter column "name" type varchar using ("name"::varchar);'
    );

    this.addSql('alter table "traverse" alter column "name" type varchar using ("name"::varchar);');
    this.addSql(
      'alter table "traverse" alter column "description" type varchar using ("description"::varchar);'
    );
    this.addSql(
      'alter table "traverse" alter column "traverse_rate" type float4 using ("traverse_rate"::float4);'
    );

    this.addSql(
      'alter table "user" alter column "username" type varchar using ("username"::varchar);'
    );
    this.addSql('alter table "user" alter column "email" type varchar using ("email"::varchar);');
    this.addSql(
      'alter table "user" alter column "password" type varchar using ("password"::varchar);'
    );
  }
}
