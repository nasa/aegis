import { Migration } from "@mikro-orm/migrations";

export class Migration20260717000000 extends Migration {
  override async up(): Promise<void> {
    // First-class COG support: a raster (type "tile") sublayer whose path points at a
    // self-describing Cloud-Optimized GeoTIFF. NOT NULL DEFAULT false backfills every existing
    // row so the (required, non-optional) Sublayer.isCog field is always a boolean.
    this.addSql(`alter table "sublayer_db" add column "is_cog" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "sublayer_db" drop column "is_cog";`);
  }
}
