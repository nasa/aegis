import { Migration } from "@mikro-orm/migrations";

export class Migration20230711183832 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "mission" add column "planet_radius" double precision null, add column "initial_zoom" double precision null, add column "dem_file_path" text null, add column "dem_resolution" double precision null, add column "proj_is_custom" boolean not null default false, add column "proj_epsg" text null, add column "proj_proj4string" text null, add column "proj_bounds_min_x" double precision null, add column "proj_bounds_min_y" double precision null, add column "proj_bounds_max_x" double precision null, add column "proj_bounds_max_y" double precision null, add column "proj_origin_x" double precision null, add column "proj_origin_y" double precision null, add column "proj_res_zoom_level" double precision null, add column "proj_res_units_per_pixel" double precision null;'
    );
  }

  async down(): Promise<void> {
    this.addSql('alter table "mission" drop column "planet_radius";');
    this.addSql('alter table "mission" drop column "initial_zoom";');
    this.addSql('alter table "mission" drop column "dem_file_path";');
    this.addSql('alter table "mission" drop column "dem_resolution";');
    this.addSql('alter table "mission" drop column "proj_is_custom";');
    this.addSql('alter table "mission" drop column "proj_epsg";');
    this.addSql('alter table "mission" drop column "proj_proj4string";');
    this.addSql('alter table "mission" drop column "proj_bounds_min_x";');
    this.addSql('alter table "mission" drop column "proj_bounds_min_y";');
    this.addSql('alter table "mission" drop column "proj_bounds_max_x";');
    this.addSql('alter table "mission" drop column "proj_bounds_max_y";');
    this.addSql('alter table "mission" drop column "proj_origin_x";');
    this.addSql('alter table "mission" drop column "proj_origin_y";');
    this.addSql('alter table "mission" drop column "proj_res_zoom_level";');
    this.addSql('alter table "mission" drop column "proj_res_units_per_pixel";');
  }
}
