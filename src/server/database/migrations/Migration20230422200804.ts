import { Migration } from "@mikro-orm/migrations";

export class Migration20230422200804 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "traverse" rename column "duration_lower" to "predicted_duration_lower";'
    );
    this.addSql(
      'alter table "traverse" rename column "duration_upper" to "predicted_duration_upper";'
    );
    this.addSql('alter table "traverse" add column "traverse_rate" real null;');
  }

  async down(): Promise<void> {
    this.addSql(
      'alter table "traverse" rename column "predicted_duration_lower" to "duration_lower";'
    );
    this.addSql(
      'alter table "traverse" rename column "predicted_duration_upper" to "duration_upper";'
    );
    this.addSql('alter table "traverse" drop column "traverse_rate";');
  }
}
