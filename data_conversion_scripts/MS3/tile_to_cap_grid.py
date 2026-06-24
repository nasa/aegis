#!/usr/bin/env python3
"""Tile a raster onto the AEGIS lunar **south-pole cap grid** — the shared map
definition used by the production ``NAC_POLE_SOUTH_CM_AVG_MERGE`` basemap.

Every layer tiled this way overlays that basemap pixel-for-pixel in Leaflet.
Uses pure rasterio/numpy — no gdal CLI required.

    Origin              = (-931100, -931100)        # cap bottom-left
    Extent              = -931100 .. 931100  (both axes)
    z0 units-per-pixel  = 12800  ->  z13 = 1.5625   # 14 levels, TMS (y from bottom)

The z0 resolution (12800) must equal the mission's ``projResUnitsPerPixel``
(with ``projResZoomLevel = 0``): Leaflet builds its per-mission resolution pyramid
as ``12800 / 2**z`` and uses it to compute tile indices.  Every layer must be cut
on this same z0 or Leaflet requests non-existent indices → 404s.

Alignment note
--------------
The cap is not a whole number of tiles wide.  The production basemap anchors at the
BOTTOM-left (-931100) and lets the partial tile fall off the TOP — exactly what
Leaflet assumes.  This script replicates that: it computes tile indices from the
bottom-left and counts up, so the TMS y=0 row coincides with y=-931100.

Usage
-----
    cd data_conversion_scripts
    uv run python MS3/tile_to_cap_grid.py <input_8bit.tif> <output_dir>

See MS3/PROBLEM_nac-ortho-scale.md for the full alignment investigation.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.windows import Window
from PIL import Image  # type: ignore

# Windows consoles default to cp1252; force UTF-8 so banners don't crash.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# ---------------------------------------------------------------------------
# Cap-grid constants
# ---------------------------------------------------------------------------
CAP_MIN = -931100.0
CAP_MAX = 931100.0
TILE = 256

CAP_Z0_RES = 12800.0   # must equal mission projResUnitsPerPixel
CAP_MAX_ZOOM = 13       # z13 = 1.5625 m/px

CAP_SRS = (
    'PROJCS["PolarStereographic_Moon",GEOGCS["GCS_Moon",DATUM["D_Moon",'
    'SPHEROID["Moon",1737400,0]],PRIMEM["Reference_Meridian",0],'
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]]],'
    'PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",-90],'
    'PARAMETER["central_meridian",0],PARAMETER["false_easting",0],'
    'PARAMETER["false_northing",0],UNIT["metre",1],'
    'AXIS["Easting",NORTH],AXIS["Northing",NORTH]]'
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def write_tilemapresource(out_dir: Path, max_zoom: int, z0_res: float) -> None:
    """Emit a cap-grid tilemapresource.xml with full-cap BoundingBox."""
    tilesets = "\n".join(
        f'        <TileSet href="{z}" units-per-pixel="{z0_res / 2 ** z:.14f}" order="{z}"/>'
        for z in range(max_zoom + 1)
    )
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
    <TileMap version="1.0.0" tilemapservice="http://tms.osgeo.org/1.0.0">
      <Title>{out_dir.name}</Title>
      <Abstract></Abstract>
      <SRS>{CAP_SRS}</SRS>
      <BoundingBox minx="{CAP_MIN:.14f}" miny="{CAP_MIN:.14f}" maxx="{CAP_MAX:.14f}" maxy="{CAP_MAX:.14f}"/>
      <Origin x="{CAP_MIN:.14f}" y="{CAP_MIN:.14f}"/>
      <TileFormat width="256" height="256" mime-type="image/png" extension="png"/>
      <TileSets profile="raster">
{tilesets}
      </TileSets>
    </TileMap>
"""
    (out_dir / "tilemapresource.xml").write_text(xml, encoding="utf-8")


def _resample_to_res(src: rasterio.DatasetReader, out_res: float, resampling: Resampling) -> tuple[np.ndarray, rasterio.transform.Affine]:
    """Read the dataset resampled to out_res m/px using rasterio."""
    src_res = src.res[0]
    scale = src_res / out_res
    new_w = max(1, round(src.width * scale))
    new_h = max(1, round(src.height * scale))
    data = src.read(
        out_shape=(src.count, new_h, new_w),
        resampling=resampling,
    )
    new_transform = rasterio.transform.Affine(
        out_res, 0.0, src.bounds.left,
        0.0, -out_res, src.bounds.top,
    )
    return data, new_transform


def _tile_range(cap_min: float, tile_span: float, data_min: float, data_max: float) -> tuple[int, int]:
    """Return inclusive [first, last] tile indices along one axis (bottom-anchored)."""
    first = int((data_min - cap_min) // tile_span)
    last = int((data_max - cap_min) // tile_span)
    return first, last


def tile_raster(
    input_path: Path,
    output_dir: Path,
    resampling: Resampling = Resampling.average,
) -> None:
    with rasterio.open(input_path) as src:
        bands = src.count
        nodata = src.nodata
        bounds = src.bounds
        r_in = float(src.res[0])

        # Snap to nearest cap zoom level
        z0_res = CAP_Z0_RES
        cap_max_zoom = CAP_MAX_ZOOM
        max_zoom = min(cap_max_zoom, max(0, round(math.log2(z0_res / r_in))))
        out_res = z0_res / 2 ** max_zoom
        tile_span = TILE * out_res

        dminx, dminy, dmaxx, dmaxy = bounds.left, bounds.bottom, bounds.right, bounds.top

        print("=" * 64)
        print("Tile → AEGIS lunar south-pole cap grid (pure rasterio)")
        print("=" * 64)
        print(f"  input              {input_path}")
        print(f"  data extent        E {dminx:.1f}..{dmaxx:.1f}  N {dminy:.1f}..{dmaxy:.1f}")
        print(f"  input res          {r_in:g} m/px  →  cap z{max_zoom} ({out_res:g} m/px)")
        print(f"  z0 units/px        {z0_res:.0f}")

        # Tile index window (bottom-anchored, matching the basemap / Leaflet convention)
        tx_min, tx_max = _tile_range(CAP_MIN, tile_span, dminx, dmaxx)
        ty_min, ty_max = _tile_range(CAP_MIN, tile_span, dminy, dmaxy)
        print(f"  tile window @z{max_zoom}    x {tx_min}..{tx_max}   y(TMS) {ty_min}..{ty_max}")
        print()

        output_dir.mkdir(parents=True, exist_ok=True)

        # Resample source to cap out_res
        data, _ = _resample_to_res(src, out_res, resampling)

        # data shape: (bands, resampled_h, resampled_w)
        # The resampled raster's top-left is at (dminx, dmaxy) in projected coords.
        res_h, res_w = data.shape[1], data.shape[2]

        n_written = 0

        for z in range(max_zoom + 1):
            z_res = z0_res / 2 ** z
            z_tile_span = TILE * z_res
            scale = out_res / z_res  # >1 means we need to upscale (won't happen for z<=max_zoom)

            # tile range at this zoom
            tx0, tx1 = _tile_range(CAP_MIN, z_tile_span, dminx, dmaxx)
            ty0, ty1 = _tile_range(CAP_MIN, z_tile_span, dminy, dmaxy)

            z_dir = output_dir / str(z)

            for tx in range(tx0, tx1 + 1):
                x_dir = z_dir / str(tx)
                x_dir.mkdir(parents=True, exist_ok=True)
                for ty in range(ty0, ty1 + 1):
                    # Tile bounds in projected coords (bottom-anchored TMS)
                    tile_left  = CAP_MIN + tx * z_tile_span
                    tile_bottom = CAP_MIN + ty * z_tile_span
                    tile_right = tile_left + z_tile_span
                    tile_top   = tile_bottom + z_tile_span

                    # Map tile projected coords → pixel coords in the resampled data array
                    # data top-left is (dminx, dmaxy), pixel size is out_res
                    px_left  = (tile_left  - dminx) / out_res
                    px_top   = (dmaxy - tile_top)   / out_res
                    px_right = (tile_right - dminx) / out_res
                    px_bot   = (dmaxy - tile_bottom) / out_res

                    # Source pixel window in the resampled array (clipped to array bounds)
                    src_px_left  = max(0.0, px_left)
                    src_px_top   = max(0.0, px_top)
                    src_px_right = min(float(res_w), px_right)
                    src_px_bot   = min(float(res_h), px_bot)

                    if src_px_right <= src_px_left or src_px_bot <= src_px_top:
                        continue  # tile fully outside data

                    # Destination pixel offsets within the 256×256 tile
                    dst_px_left  = round(src_px_left  - px_left)
                    dst_px_top   = round(src_px_top   - px_top)

                    # Slice from the resampled data
                    row0 = round(src_px_top)
                    row1 = round(src_px_bot)
                    col0 = round(src_px_left)
                    col1 = round(src_px_right)

                    if row1 <= row0 or col1 <= col0:
                        continue

                    # Scale factor for this zoom relative to max_zoom data
                    zoom_scale = 2 ** (z - max_zoom)  # <1 for z < max_zoom (downscale)

                    if zoom_scale < 1.0:
                        # For overview zooms, resample the max-zoom data
                        # Sample at lower resolution
                        ovr_h = round((row1 - row0) * zoom_scale) or 1
                        ovr_w = round((col1 - col0) * zoom_scale) or 1
                        patch = data[:, row0:row1, col0:col1]
                        # Simple average downsample
                        from PIL import Image as PILImage
                        imgs = []
                        for b in range(bands):
                            arr = patch[b]
                            img = PILImage.fromarray(arr.astype(np.uint8) if arr.dtype != np.uint8 else arr)
                            img = img.resize((ovr_w, ovr_h), PILImage.LANCZOS)
                            imgs.append(np.array(img))
                        patch_scaled = np.stack(imgs)
                    else:
                        patch_scaled = data[:, row0:row1, col0:col1]

                    patch_h, patch_w = patch_scaled.shape[1], patch_scaled.shape[2]

                    # Build tile canvas (RGBA)
                    tile_arr = np.zeros((TILE, TILE, 4), dtype=np.uint8)

                    dst_row1 = dst_px_top + patch_h
                    dst_col1 = dst_px_left + patch_w

                    # Clip destination to tile bounds
                    dst_row1c = min(TILE, dst_row1)
                    dst_col1c = min(TILE, dst_col1)
                    src_row1c = patch_h - (dst_row1 - dst_row1c)
                    src_col1c = patch_w - (dst_col1 - dst_col1c)

                    if dst_row1c <= dst_px_top or dst_col1c <= dst_px_left:
                        continue
                    if src_row1c <= 0 or src_col1c <= 0:
                        continue

                    for b in range(min(bands, 3)):
                        tile_arr[dst_px_top:dst_row1c, dst_px_left:dst_col1c, b] = (
                            patch_scaled[b, :src_row1c, :src_col1c]
                        )
                    if bands == 1:
                        tile_arr[dst_px_top:dst_row1c, dst_px_left:dst_col1c, 1] = (
                            patch_scaled[0, :src_row1c, :src_col1c]
                        )
                        tile_arr[dst_px_top:dst_row1c, dst_px_left:dst_col1c, 2] = (
                            patch_scaled[0, :src_row1c, :src_col1c]
                        )

                    # Alpha: 0 where nodata/0, 255 elsewhere
                    luma = patch_scaled[0, :src_row1c, :src_col1c]
                    if nodata is not None:
                        alpha = np.where(luma == int(nodata), 0, 255).astype(np.uint8)
                    else:
                        alpha = np.where(luma == 0, 0, 255).astype(np.uint8)
                    tile_arr[dst_px_top:dst_row1c, dst_px_left:dst_col1c, 3] = alpha

                    if not np.any(tile_arr[:, :, 3]):
                        continue  # skip fully transparent tiles

                    img = Image.fromarray(tile_arr, mode="RGBA")
                    tile_path = x_dir / f"{ty}.png"
                    img.save(str(tile_path), format="PNG")
                    n_written += 1

    write_tilemapresource(output_dir, max_zoom, CAP_Z0_RES)
    print(f"\n  tiles written: {n_written:,}")
    print(f"  tilemapresource.xml: {output_dir / 'tilemapresource.xml'}")
    print(
        "\n  Cap-grid layer — overlays the existing basemap; "
        "mission projOrigin/projResUnitsPerPixel stay unchanged (-931100 / 12800)."
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Tile a raster onto the AEGIS lunar south-pole cap grid (pure rasterio, no gdal CLI).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("input", type=Path, help="Input 8-bit raster (lunar S-pole stereo CRS)")
    ap.add_argument("output_dir", type=Path, help="Output tile directory")
    ap.add_argument(
        "--resampling",
        default="average",
        choices=["average", "nearest", "bilinear", "lanczos"],
        help="Resampling method (default: average)",
    )
    args = ap.parse_args()

    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    resampling_map = {
        "average": Resampling.average,
        "nearest": Resampling.nearest,
        "bilinear": Resampling.bilinear,
        "lanczos": Resampling.lanczos,
    }
    tile_raster(args.input, args.output_dir, resampling=resampling_map[args.resampling])


if __name__ == "__main__":
    main()
