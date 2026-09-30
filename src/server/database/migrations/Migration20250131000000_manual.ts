import { Migration } from "@mikro-orm/migrations";

export class Migration20250131000000_manual extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      update "preset_db"
      set "map_circle_controls" = (
        select jsonb_object_agg(
          key,
          jsonb_set(
            value - 'landerRadiusUuid',
            '{uuid}',
            value->'landerRadiusUuid'
          )
        )
        from jsonb_each("map_circle_controls")
      )
      where "map_circle_controls" is not null;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`
      update "preset_db"
      set "map_circle_controls" = (
        select jsonb_object_agg(
          key,
          jsonb_set(
            value - 'uuid',
            '{landerRadiusUuid}',
            value->'uuid'
          )
        )
        from jsonb_each("map_circle_controls")
      )
      where "map_circle_controls" is not null;
    `);
  }
}
