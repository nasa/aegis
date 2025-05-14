import { Migration } from "@mikro-orm/migrations";

export class Migration20250514142539 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "eva_db" rename column "duration" to "max_duration";`);

    this.addSql(`alter table "preset_db" add column "map_grid_control" jsonb null;`);

    this.addSql(`alter table "station_db" add column "duration_upper" real null;`);
    this.addSql(`alter table "station_db" rename column "duration" to "duration_lower";`);

    this.addSql(`alter table "traverse_db" add column "predicted_duration_upper" real null;`);
    this.addSql(
      `alter table "traverse_db" rename column "duration" to "predicted_duration_lower";`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "eva_db" rename column "max_duration" to "duration";`);

    this.addSql(`alter table "preset_db" drop column "map_grid_control";`);

    this.addSql(`alter table "station_db" drop column "duration_upper";`);

    this.addSql(`alter table "station_db" rename column "duration_lower" to "duration";`);

    this.addSql(`alter table "traverse_db" drop column "predicted_duration_upper";`);

    this.addSql(
      `alter table "traverse_db" rename column "predicted_duration_lower" to "duration";`
    );
  }
}
