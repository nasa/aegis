import { Migration } from "@mikro-orm/migrations";

export class Migration20250131175841 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "mission_db" rename column "lander_radii" to "circle_definitions";`);

    this.addSql(
      `alter table "station_db" add column "map_circle_controls" jsonb not null default '{}';`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "mission_db" rename column "circle_definitions" to "lander_radii";`);

    this.addSql(`alter table "station_db" drop column "map_circle_controls";`);
  }
}
