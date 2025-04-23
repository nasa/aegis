import { Migration } from "@mikro-orm/migrations";

export class Migration20250409204017 extends Migration {
  override async up(): Promise<void> {
    // First, add the new style column
    this.addSql(`alter table "sublayer_db" add column "style" jsonb null;`);

    // Convert existing columns into the style JSON structure with defaults for missing properties
    this.addSql(`
      update "sublayer_db"
      set "style" = jsonb_build_object(
        'color', COALESCE("color", ''),
        'opacity', COALESCE("opacity", 0),
        'weight', COALESCE("weight", 0),
        'fillColor', COALESCE("fill_color", ''),
        'fillOpacity', COALESCE("fill_opacity", 0),
        'contrast', 0,
        'brightness', 0,
        'saturation', 0,
        'blendMode', 'normal'
      );
    `);

    // After data migration, drop the old columns
    this.addSql(
      `alter table "sublayer_db" drop column "color", drop column "opacity", drop column "fill_color", drop column "fill_opacity", drop column "weight";`
    );
  }

  override async down(): Promise<void> {
    // Add the old columns back
    this.addSql(
      `alter table "sublayer_db" add column "color" text null, add column "opacity" float8 null, add column "fill_color" text null, add column "fill_opacity" float8 null, add column "weight" float8 null;`
    );

    // Extract values from the style JSON back to individual columns
    this.addSql(`
  update "sublayer_db"
  set
    "color" = "style"->>'color',
    "opacity" = ("style"->>'opacity')::float8,
    "fill_color" = "style"->>'fillColor',
    "fill_opacity" = ("style"->>'fillOpacity')::float8,
    "weight" = ("style"->>'weight')::float8
  where "style" is not null;
`);

    // Finally drop the style column
    this.addSql(`alter table "sublayer_db" drop column "style";`);
  }
}
