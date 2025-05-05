import { Migration } from "@mikro-orm/migrations";

export class Migration20250429192807 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "mission_db" alter column "traverse_rate" type real using ("traverse_rate"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "lander_elevation_meters" type real using ("lander_elevation_meters"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "default_eva_duration" type real using ("default_eva_duration"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "walkback_rate" type real using ("walkback_rate"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "planet_radius" type real using ("planet_radius"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "initial_zoom" type real using ("initial_zoom"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "dem_resolution" type real using ("dem_resolution"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_min_x" type real using ("proj_bounds_min_x"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_min_y" type real using ("proj_bounds_min_y"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_max_x" type real using ("proj_bounds_max_x"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_max_y" type real using ("proj_bounds_max_y"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_origin_x" type real using ("proj_origin_x"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_origin_y" type real using ("proj_origin_y"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_res_zoom_level" type real using ("proj_res_zoom_level"::real);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_res_units_per_pixel" type real using ("proj_res_units_per_pixel"::real);`
    );

    this.addSql(
      `alter table "eva_db" alter column "max_duration" type real using ("max_duration"::real);`
    );
    this.addSql(
      `alter table "eva_db" alter column "traverse_rate" type real using ("traverse_rate"::real);`
    );
    this.addSql(
      `alter table "eva_db" alter column "egress_duration" type real using ("egress_duration"::real);`
    );
    this.addSql(
      `alter table "eva_db" alter column "ingress_duration" type real using ("ingress_duration"::real);`
    );

    this.addSql(
      `alter table "preset_db" alter column "sun_azimuth" type real using ("sun_azimuth"::real);`
    );
    this.addSql(
      `alter table "preset_db" alter column "earth_azimuth" type real using ("earth_azimuth"::real);`
    );

    this.addSql(
      `alter table "station_db" alter column "duration_lower" type real using ("duration_lower"::real);`
    );
    this.addSql(
      `alter table "station_db" alter column "duration_upper" type real using ("duration_upper"::real);`
    );
    this.addSql(
      `alter table "station_db" alter column "walkback_traverse_rate" type real using ("walkback_traverse_rate"::real);`
    );

    this.addSql(
      `alter table "sublayer_db" alter column "min_native_zoom" type real using ("min_native_zoom"::real);`
    );
    this.addSql(
      `alter table "sublayer_db" alter column "max_native_zoom" type real using ("max_native_zoom"::real);`
    );
    this.addSql(
      `alter table "sublayer_db" alter column "max_zoom" type real using ("max_zoom"::real);`
    );

    this.addSql(
      `alter table "traverse_db" alter column "predicted_duration_lower" type real using ("predicted_duration_lower"::real);`
    );
    this.addSql(
      `alter table "traverse_db" alter column "predicted_duration_upper" type real using ("predicted_duration_upper"::real);`
    );
    this.addSql(
      `alter table "traverse_db" alter column "traverse_rate" type real using ("traverse_rate"::real);`
    );

    this.addSql(
      `alter table "action_db" alter column "duration_lower" type real using ("duration_lower"::real);`
    );
    this.addSql(
      `alter table "action_db" alter column "duration_upper" type real using ("duration_upper"::real);`
    );
    this.addSql(`alter table "action_db" alter column "mass" type real using ("mass"::real);`);
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "action_db" alter column "duration_lower" type float8 using ("duration_lower"::float8);`
    );
    this.addSql(
      `alter table "action_db" alter column "duration_upper" type float8 using ("duration_upper"::float8);`
    );
    this.addSql(`alter table "action_db" alter column "mass" type float8 using ("mass"::float8);`);

    this.addSql(
      `alter table "eva_db" alter column "max_duration" type float8 using ("max_duration"::float8);`
    );
    this.addSql(
      `alter table "eva_db" alter column "traverse_rate" type float8 using ("traverse_rate"::float8);`
    );
    this.addSql(
      `alter table "eva_db" alter column "egress_duration" type float8 using ("egress_duration"::float8);`
    );
    this.addSql(
      `alter table "eva_db" alter column "ingress_duration" type float8 using ("ingress_duration"::float8);`
    );

    this.addSql(
      `alter table "mission_db" alter column "traverse_rate" type float8 using ("traverse_rate"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "lander_elevation_meters" type float8 using ("lander_elevation_meters"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "default_eva_duration" type float8 using ("default_eva_duration"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "walkback_rate" type float8 using ("walkback_rate"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "planet_radius" type float8 using ("planet_radius"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "initial_zoom" type float8 using ("initial_zoom"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "dem_resolution" type float8 using ("dem_resolution"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_min_x" type float8 using ("proj_bounds_min_x"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_min_y" type float8 using ("proj_bounds_min_y"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_max_x" type float8 using ("proj_bounds_max_x"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_bounds_max_y" type float8 using ("proj_bounds_max_y"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_origin_x" type float8 using ("proj_origin_x"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_origin_y" type float8 using ("proj_origin_y"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_res_zoom_level" type float8 using ("proj_res_zoom_level"::float8);`
    );
    this.addSql(
      `alter table "mission_db" alter column "proj_res_units_per_pixel" type float8 using ("proj_res_units_per_pixel"::float8);`
    );

    this.addSql(
      `alter table "preset_db" alter column "sun_azimuth" type float8 using ("sun_azimuth"::float8);`
    );
    this.addSql(
      `alter table "preset_db" alter column "earth_azimuth" type float8 using ("earth_azimuth"::float8);`
    );

    this.addSql(
      `alter table "station_db" alter column "walkback_traverse_rate" type float8 using ("walkback_traverse_rate"::float8);`
    );
    this.addSql(
      `alter table "station_db" alter column "duration_lower" type float8 using ("duration_lower"::float8);`
    );
    this.addSql(
      `alter table "station_db" alter column "duration_upper" type float8 using ("duration_upper"::float8);`
    );

    this.addSql(
      `alter table "sublayer_db" alter column "min_native_zoom" type float8 using ("min_native_zoom"::float8);`
    );
    this.addSql(
      `alter table "sublayer_db" alter column "max_native_zoom" type float8 using ("max_native_zoom"::float8);`
    );
    this.addSql(
      `alter table "sublayer_db" alter column "max_zoom" type float8 using ("max_zoom"::float8);`
    );

    this.addSql(
      `alter table "traverse_db" alter column "predicted_duration_lower" type float8 using ("predicted_duration_lower"::float8);`
    );
    this.addSql(
      `alter table "traverse_db" alter column "predicted_duration_upper" type float8 using ("predicted_duration_upper"::float8);`
    );
    this.addSql(
      `alter table "traverse_db" alter column "traverse_rate" type float8 using ("traverse_rate"::float8);`
    );
  }
}
