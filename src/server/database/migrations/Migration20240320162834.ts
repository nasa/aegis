import { Migration } from "@mikro-orm/migrations";

export class Migration20240320162834 extends Migration {
  async up(): Promise<void> {
    // Drop existing foreign keys
    this.addSql(
      'alter table "stm_investigation_db" drop constraint "stm_investigation_db_goal_uuid_foreign";'
    );
    this.addSql('alter table "stm_goal_db" drop constraint "stm_goal_db_objective_uuid_foreign";');

    // Rename tables
    this.addSql('alter table "stm_investigation_db" rename to "stm_level3_db";');
    this.addSql('alter table "stm_goal_db" rename to "stm_level2_db";');
    this.addSql('alter table "stm_objective_db" rename to "stm_level1_db";');

    // Rename "objective" field to "level1" in "stm_level2_db"
    this.addSql('alter table "stm_level2_db" rename column "objective_uuid" to "level1_uuid";');

    // Rename "goal" field to "level2" in "stm_level3_db"
    this.addSql('alter table "stm_level3_db" rename column "goal_uuid" to "level2_uuid";');

    // Add foreign keys with new names
    this.addSql(
      'alter table "stm_level3_db" add constraint "stm_level3_db_level2_uuid_foreign" foreign key ("level2_uuid") references "stm_level2_db" ("uuid") on update cascade;'
    );
    this.addSql(
      'alter table "stm_level2_db" add constraint "stm_level2_db_level1_uuid_foreign" foreign key ("level1_uuid") references "stm_level1_db" ("uuid") on update cascade;'
    );
  }

  async down(): Promise<void> {
    // Drop the renamed foreign keys
    this.addSql('alter table "stm_level3_db" drop constraint "stm_level3_db_level2_uuid_foreign";');
    this.addSql('alter table "stm_level2_db" drop constraint "stm_level2_db_level1_uuid_foreign";');

    // Revert "level1" field back to "objective" in "stm_level2_db"
    this.addSql('alter table "stm_level2_db" rename column "level1_uuid" to "objective_uuid";');

    // Revert "level2" field back to "goal" in "stm_level3_db"
    this.addSql('alter table "stm_level3_db" rename column "level2_uuid" to "goal_uuid";');

    // Rename tables back to their original names
    this.addSql('alter table "stm_level3_db" rename to "stm_investigation_db";');
    this.addSql('alter table "stm_level2_db" rename to "stm_goal_db";');
    this.addSql('alter table "stm_level1_db" rename to "stm_objective_db";');

    // Re-add the original foreign keys with their original names
    this.addSql(
      'alter table "stm_investigation_db" add constraint "stm_investigation_db_goal_uuid_foreign" foreign key ("goal_uuid") references "stm_goal_db" ("uuid") on update cascade;'
    );
    this.addSql(
      'alter table "stm_goal_db" add constraint "stm_goal_db_objective_uuid_foreign" foreign key ("objective_uuid") references "stm_objective_db" ("uuid") on update cascade;'
    );
  }
}
