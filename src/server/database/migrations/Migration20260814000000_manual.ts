import { Migration } from "@mikro-orm/migrations";

/**
 * Backfill `style.fillOpacity` on preset sublayer controls that predate the field.
 *
 * Only controls actually missing the key (or holding a JSON null) are touched — controls
 * that already carry an operator-chosen opacity keep it.
 */
export class Migration20260814000000_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      update preset_db
      set map_sublayer_controls = (
        select jsonb_object_agg(
          key,
          case
            when jsonb_typeof(value -> 'style') = 'object'
              and (
                not (value -> 'style') ? 'fillOpacity'
                or value -> 'style' -> 'fillOpacity' = 'null'::jsonb
              )
            then jsonb_set(value, '{style,fillOpacity}', '0'::jsonb, true)
            else value
          end
        )
        from jsonb_each(map_sublayer_controls)
      )
      where map_sublayer_controls is not null
        and exists (
          select 1
          from jsonb_each(map_sublayer_controls)
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
