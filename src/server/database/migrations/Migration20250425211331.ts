import { Migration } from "@mikro-orm/migrations";

export class Migration20250425211331 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "stm_level1_db" drop constraint "stm_objective_db_mission_id_foreign";`
    );

    this.addSql(
      `alter table "stm_level1_db" add constraint "stm_level1_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "stm_level1_db" drop constraint "stm_level1_db_mission_id_foreign";`);

    this.addSql(
      `alter table "stm_level1_db" add constraint "stm_objective_db_mission_id_foreign" foreign key ("mission_id") references "mission_db" ("id") on update cascade on delete no action;`
    );
  }
}
