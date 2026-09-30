import { Migration } from "@mikro-orm/migrations";

export class Migration20250610152123 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "station_db" drop column "duration_lower";`);

    this.addSql(`alter table "station_db" rename column "duration_upper" to "duration";`);

    this.addSql(`alter table "eva_db" rename column "max_duration" to "duration";`);

    this.addSql(`alter table "traverse_db" drop column "predicted_duration_lower";`);

    this.addSql(
      `alter table "traverse_db" rename column "predicted_duration_upper" to "duration";`
    );

    this.addSql(`alter table "action_db" drop column "duration_lower";`);

    this.addSql(`alter table "action_db" rename column "duration_upper" to "duration";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "station_db" add column "duration_lower" float4 null;`);
    this.addSql(`alter table "station_db" rename column "duration" to "duration_upper";`);
    this.addSql(`alter table "eva_db" rename column "duration" to "max_duration";`);
    this.addSql(`alter table "traverse_db" add column "predicted_duration_lower" float4 null;`);
    this.addSql(
      `alter table "traverse_db" rename column "duration" to "predicted_duration_upper";`
    );
    this.addSql(`alter table "action_db" add column "duration_lower" float4 null;`);
    this.addSql(`alter table "action_db" rename column "duration" to "duration_upper";`);
  }
}
