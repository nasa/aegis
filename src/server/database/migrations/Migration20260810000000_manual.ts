import { Migration } from "@mikro-orm/migrations";

export class Migration20260810000000_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create function migrate_label_halo_style(style jsonb) returns jsonb
      language sql immutable as $$
        select (style - array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity'])
          || case
            when style ? 'labelHaloColor' or not style ? 'labelStrokeColor' then '{}'::jsonb
            else jsonb_build_object('labelHaloColor', style -> 'labelStrokeColor')
          end
          || case
            when style ? 'labelHaloWidth' or not style ? 'labelStrokeWidth' then '{}'::jsonb
            else jsonb_build_object('labelHaloWidth', style -> 'labelStrokeWidth')
          end
          || case
            when style ? 'labelHaloOpacity' or not style ? 'labelStrokeOpacity' then '{}'::jsonb
            else jsonb_build_object('labelHaloOpacity', style -> 'labelStrokeOpacity')
          end;
      $$;
    `);
    this.addSql(`
      update preset_db
      set map_sublayer_controls = (
        select jsonb_object_agg(
          key,
          case
            when jsonb_typeof(value -> 'style') = 'object'
              then jsonb_set(value, '{style}', migrate_label_halo_style(value -> 'style'))
            else value
          end
        )
        from jsonb_each(map_sublayer_controls)
      )
      where map_sublayer_controls is not null
        and exists (
          select 1
          from jsonb_each(map_sublayer_controls) as control
          where jsonb_typeof(value -> 'style') = 'object'
            and (value -> 'style') ?| array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity']
        );
    `);
    this.addSql(`
      update preset_db
      set map_circle_controls = (
        select jsonb_object_agg(
          key,
          case
            when jsonb_typeof(value -> 'style') = 'object'
              then jsonb_set(value, '{style}', migrate_label_halo_style(value -> 'style'))
            else value
          end
        )
        from jsonb_each(map_circle_controls)
      )
      where map_circle_controls is not null
        and exists (
          select 1
          from jsonb_each(map_circle_controls) as control
          where jsonb_typeof(value -> 'style') = 'object'
            and (value -> 'style') ?| array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity']
        );
    `);
    this.addSql(`
      update preset_db
      set map_grid_control = jsonb_set(
        map_grid_control,
        '{style}',
        migrate_label_halo_style(map_grid_control -> 'style')
      )
      where jsonb_typeof(map_grid_control -> 'style') = 'object'
        and (map_grid_control -> 'style') ?| array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity'];
    `);
    this.addSql(`drop function migrate_label_halo_style(jsonb);`);
  }

  override down(): void | Promise<void> {
    // This data migration cannot safely reconstruct overwritten legacy fields.
  }
}
