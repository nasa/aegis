import { Migration } from "@mikro-orm/migrations";

export class Migration20260810000000_manual extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create function migrate_label_halo_style(style jsonb) returns jsonb
      language sql immutable as $$
        with migrated_style as (
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
            end as value
        ), normalized_opacity as (
          select case
            when value -> 'labelHaloOpacity' in ('0.85'::jsonb, '0.1'::jsonb)
              then jsonb_set(value, '{labelHaloOpacity}', '0.2'::jsonb)
            else value
          end as value
          from migrated_style
        ), rgba_color as (
          select
            value,
            regexp_match(
              value ->> 'labelHaloColor',
              '^rgba\\([[:space:]]*([0-9]{1,3})[[:space:]]*,[[:space:]]*([0-9]{1,3})[[:space:]]*,[[:space:]]*([0-9]{1,3})[[:space:]]*,'
            ) as rgb
          from normalized_opacity
        )
        select case
          when rgb is null then value
          else jsonb_set(
            value,
            '{labelHaloColor}',
            to_jsonb(
              '#' || lpad(to_hex(least(255, greatest(0, rgb[1]::int))), 2, '0')
                || lpad(to_hex(least(255, greatest(0, rgb[2]::int))), 2, '0')
                || lpad(to_hex(least(255, greatest(0, rgb[3]::int))), 2, '0')
            )
          )
        end
        from rgba_color;
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
            and (
              (value -> 'style') ?| array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity']
              or value -> 'style' ->> 'labelHaloColor' ~ '^rgba\\('
              or value -> 'style' -> 'labelHaloOpacity' in ('0.85'::jsonb, '0.1'::jsonb)
            )
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
            and (
              (value -> 'style') ?| array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity']
              or value -> 'style' ->> 'labelHaloColor' ~ '^rgba\\('
              or value -> 'style' -> 'labelHaloOpacity' in ('0.85'::jsonb, '0.1'::jsonb)
            )
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
        and (
          (map_grid_control -> 'style') ?| array['labelStrokeColor', 'labelStrokeWidth', 'labelStrokeOpacity']
          or map_grid_control -> 'style' ->> 'labelHaloColor' ~ '^rgba\\('
          or map_grid_control -> 'style' -> 'labelHaloOpacity' in ('0.85'::jsonb, '0.1'::jsonb)
        );
    `);
    this.addSql(`drop function migrate_label_halo_style(jsonb);`);
  }

  override down(): void | Promise<void> {
    // This data migration cannot safely reconstruct overwritten legacy fields.
  }
}
