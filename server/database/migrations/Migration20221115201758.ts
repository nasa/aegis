import { Migration } from "@mikro-orm/migrations";

export class Migration20221115201758 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'create table "stmobjective" ("uuid" varchar(255) not null, "mission_id" int not null, "name" varchar(255) not null, "numbering" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "stmobjective_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "stmgoal" ("uuid" varchar(255) not null, "objective_uuid" varchar(255) not null, "name" varchar(255) not null, "numbering" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "stmgoal_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'create table "stminvestigation" ("uuid" varchar(255) not null, "goal_uuid" varchar(255) not null, "name" varchar(255) not null, "numbering" varchar(255) not null, "created_at" timestamptz(0) not null, "updated_at" timestamptz(0) not null, constraint "stminvestigation_pkey" primary key ("uuid"));'
    );

    this.addSql(
      'alter table "stmobjective" add constraint "stmobjective_mission_id_foreign" foreign key ("mission_id") references "mission" ("id") on update cascade;'
    );

    this.addSql(
      'alter table "stmgoal" add constraint "stmgoal_objective_uuid_foreign" foreign key ("objective_uuid") references "stmobjective" ("uuid") on update cascade;'
    );

    this.addSql(
      'alter table "stminvestigation" add constraint "stminvestigation_goal_uuid_foreign" foreign key ("goal_uuid") references "stmgoal" ("uuid") on update cascade;'
    );

    this.addSql('alter table "preset" alter column "owner_id" drop default;');
    this.addSql('alter table "preset" alter column "owner_id" type int using ("owner_id"::int);');
  }

  async down(): Promise<void> {
    this.addSql('alter table "stmgoal" drop constraint "stmgoal_objective_uuid_foreign";');

    this.addSql(
      'alter table "stminvestigation" drop constraint "stminvestigation_goal_uuid_foreign";'
    );

    this.addSql('drop table if exists "stmobjective" cascade;');

    this.addSql('drop table if exists "stmgoal" cascade;');

    this.addSql('drop table if exists "stminvestigation" cascade;');

    this.addSql('alter table "preset" alter column "owner_id" type int4 using ("owner_id"::int4);');
    this.addSql('alter table "preset" alter column "owner_id" set default 1;');
  }
}
