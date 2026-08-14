import { Migration } from "@mikro-orm/migrations";

export class Migration20260814000000_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      update preset_db
      set map_sublayer_controls = (
        select jsonb_object_agg(
          key,
          jsonb_set(value, '{style,fillOpacity}', '0'::jsonb, true)
        )
        from jsonb_each(map_sublayer_controls)
      )
      where map_sublayer_controls is not null
        and exists (
          select 1
          from jsonb_each(map_sublayer_controls) as control
          where jsonb_typeof(value -> 'style') = 'object'
            and (
              not (value -> 'style') ? 'fillOpacity'
              or value -> 'style' -> 'fillOpacity' = 'null'::jsonb
            )
        );
    `);
  }

  override down(): void | Promise<void> {
    // Missing legacy values cannot be distinguished from an intentional zero after migration.
  }
}
