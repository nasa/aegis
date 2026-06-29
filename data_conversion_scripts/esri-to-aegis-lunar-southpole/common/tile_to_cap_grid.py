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
    uv run python esri-to-aegis-lunar-southpole/common/tile_to_cap_grid.py <input_8bit.tif> <output_dir>

The cap-grid / projection constants live in ``config.py`` at the pipeline root, so
the tiler and the AEGIS admin summary can never drift apart.
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

# Import the shared projection profile from the pipeline root (one level up from
# common/). This file is run as a script via subprocess, so common/ — not the
# pipeline root — is on sys.path[0]; add the root explicitly before importing.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (  # noqa: E402
    CAP_MIN,
    CAP_MAX,
    TILE,
    CAP_Z0_RES,
    CAP_MAX_ZOOM,
    CAP_SRS,
)

# Windows consoles default to cp1252; force UTF-8 so banners don't crash.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def write_tilemapresource(
    out_dir: Path,
    max_zoom: int,
    z0_res: float,
    bbox: tuple[float, float, float, float] | None = None,
) -> None:
    """Emit a cap-grid tilemapresource.xml.

    ``bbox`` is the layer's TIGHT data extent ``(minx, miny, maxx, maxy)`` in cap-grid
    projected metres.  Renderers (Leaflet via our projected-bounds shim, OpenLayers via
    a native ``extent``) use it to clip tile requests to the data patch instead of
    walking the whole ~1.86 Mm cap — without it the layer 404-storms for every tile that
    was never written.  ``<Origin>`` always stays the cap origin so tile indices remain
    on the shared grid.  When ``bbox`` is ``None`` it falls back to the full cap.
    """
    minx, miny, maxx, maxy = bbox if bbox is not None else (CAP_MIN, CAP_MIN, CAP_MAX, CAP_MAX)
    tilesets = "\n".join(
        f'        <TileSet href="{z}" units-per-pixel="{z0_res / 2 ** z:.14f}" order="{z}"/>'
        for z in range(max_zoom + 1)
    )
    xml = f"""<?xml version="1.0" encoding="utf-8"?>
    <TileMap version="1.0.0" tilemapservice="http://tms.osgeo.org/1.0.0">
      <Title>{out_dir.name}</Title>
      <Abstract></Abstract>
      <SRS>{CAP_SRS}</SRS>
      <BoundingBox minx="{minx:.14f}" miny="{miny:.14f}" maxx="{maxx:.14f}" maxy="{maxy:.14f}"/>
      <Origin x="{CAP_MIN:.14f}" y="{CAP_MIN:.14f}"/>
      <TileFormat width="256" height="256" mime-type="image/png" extension="png"/>
      <TileSets profile="raster">
{tilesets}
      </TileSets>
    </TileMap>
"""
    (out_dir / "tilemapresource.xml").write_text(xml, encoding="utf-8")


def _resample_to_res(
    src: rasterio.DatasetReader, out_res: float, resampling: Resampling
) -> tuple[np.ndarray, rasterio.transform.Affine]:
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
        out_res,
        0.0,
        src.bounds.left,
        0.0,
        -out_res,
        src.bounds.top,
    )
    return data, new_transform


def _x_tile_range(
    tile_span: float, data_min: float, data_max: float
) -> tuple[int, int]:
    """X tile indices — bottom-left anchored at CAP_MIN."""
    first = int((data_min - CAP_MIN) // tile_span)
    last = int((data_max - CAP_MIN) // tile_span)
    return first, last


def _y_tile_range(
    tile_span: float, cap_top: float, data_min: float, data_max: float
) -> tuple[int, int]:
    """Y TMS tile indices using the same padded cap_top the gdal version uses.

    The cap is not a whole number of tiles tall, so we pad cap_top up to the
    next tile boundary.  The working gdal pipeline (commit f0161bcb2) used:
        cap_top = CAP_MIN + ceil(cap_width / tile_span) * tile_span
        ymin_xyz = (cap_top - dmaxy) // tile_span
        ymax_xyz = (cap_top - dminy) // tile_span
    and --convention tms flipped those XYZ indices to TMS with the tile count.
    We replicate that directly so our TMS y-indices land on the same rows.
    """
    # XYZ (top-down) indices, anchored at padded cap_top
    y_xyz_min = int((cap_top - data_max) // tile_span)
    y_xyz_max = int((cap_top - data_min) // tile_span)
    # n_tiles is the total number of tile rows in the padded cap
    n_tiles = int(round((cap_top - CAP_MIN) / tile_span))
    # TMS flip: tms_y = (n_tiles - 1) - xyz_y
    tms_min = (n_tiles - 1) - y_xyz_max
    tms_max = (n_tiles - 1) - y_xyz_min
    return tms_min, tms_max


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
        out_res = z0_res / 2**max_zoom
        tile_span = TILE * out_res

        dminx, dminy, dmaxx, dmaxy = (
            bounds.left,
            bounds.bottom,
            bounds.right,
            bounds.top,
        )

        # Padded cap top — same calculation as the working gdal version (commit f0161bcb2).
        # The cap is NOT a whole number of tiles wide; pad top/right to the next tile
        # boundary so the bottom-left stays exactly on CAP_MIN.  This makes y-indices
        # match what gdal raster tile --convention tms would produce.
        n_cap_tiles = math.ceil((CAP_MAX - CAP_MIN) / tile_span)
        cap_top = CAP_MIN + n_cap_tiles * tile_span

        print("=" * 64)
        print("Tile → AEGIS lunar south-pole cap grid (pure rasterio)")
        print("=" * 64)
        print(f"  input              {input_path}")
        print(
            f"  data extent        E {dminx:.1f}..{dmaxx:.1f}  N {dminy:.1f}..{dmaxy:.1f}"
        )
        print(
            f"  input res          {r_in:g} m/px  →  cap z{max_zoom} ({out_res:g} m/px)"
        )
        print(f"  z0 units/px        {z0_res:.0f}")
        print(f"  cap_top (padded)   {cap_top:.1f}")

        tx_min, tx_max = _x_tile_range(tile_span, dminx, dmaxx)
        ty_min, ty_max = _y_tile_range(tile_span, cap_top, dminy, dmaxy)
        print(
            f"  tile window @z{max_zoom}    x {tx_min}..{tx_max}   y(TMS) {ty_min}..{ty_max}"
        )
        print()

        output_dir.mkdir(parents=True, exist_ok=True)

        # Resample source to cap out_res
        data, _ = _resample_to_res(src, out_res, resampling)

        # data shape: (bands, resampled_h, resampled_w)
        # The resampled raster's top-left is at (dminx, dmaxy) in projected coords.
        res_h, res_w = data.shape[1], data.shape[2]

        n_written = 0

        for z in range(max_zoom + 1):
            # Scale factor from max_zoom to this zoom: each coarser tile covers
            # 2^(max_zoom - z) max_zoom tiles. We derive the tile indices directly
            # from the max_zoom indices so all zoom levels share the same grid anchor.
            scale = 2 ** (max_zoom - z)

            # Tile indices at this zoom are simply the max_zoom indices divided by scale
            # (floor for min, floor for max — same boundary alignment).
            tx0 = tx_min // scale
            tx1 = tx_max // scale
            ty0 = ty_min // scale
            ty1 = ty_max // scale

            z_res = z0_res / 2**z
            z_tile_span = TILE * z_res

            z_dir = output_dir / str(z)

            for tx in range(tx0, tx1 + 1):
                x_dir = z_dir / str(tx)
                x_dir.mkdir(parents=True, exist_ok=True)
                for ty in range(ty0, ty1 + 1):
                    # Tile bounds in projected coords (bottom-anchored TMS)
                    tile_left = CAP_MIN + tx * z_tile_span
                    tile_bottom = CAP_MIN + ty * z_tile_span
                    tile_right = tile_left + z_tile_span
                    tile_top = tile_bottom + z_tile_span

                    # Map tile projected coords → pixel coords in the resampled data array
                    # data top-left is (dminx, dmaxy), pixel size is out_res
                    px_left = (tile_left - dminx) / out_res
                    px_top = (dmaxy - tile_top) / out_res
                    px_right = (tile_right - dminx) / out_res
                    px_bot = (dmaxy - tile_bottom) / out_res

                    # Source pixel window in the resampled array (clipped to array bounds)
                    src_px_left = max(0.0, px_left)
                    src_px_top = max(0.0, px_top)
                    src_px_right = min(float(res_w), px_right)
                    src_px_bot = min(float(res_h), px_bot)

                    if src_px_right <= src_px_left or src_px_bot <= src_px_top:
                        continue  # tile fully outside data

                    # Destination pixel offsets within the 256×256 tile.
                    # px_left/px_top are in max_zoom pixel units; the tile canvas is
                    # in *this zoom's* pixel units, so scale by zoom_scale (<1 for
                    # overview zooms).
                    zoom_scale = 2 ** (z - max_zoom)  # <1 for z < max_zoom
                    dst_px_left = round((src_px_left - px_left) * zoom_scale)
                    dst_px_top = round((src_px_top - px_top) * zoom_scale)

                    # Slice from the resampled data
                    row0 = round(src_px_top)
                    row1 = round(src_px_bot)
                    col0 = round(src_px_left)
                    col1 = round(src_px_right)

                    if row1 <= row0 or col1 <= col0:
                        continue

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
                            img = PILImage.fromarray(
                                arr.astype(np.uint8) if arr.dtype != np.uint8 else arr
                            )
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

                    # Alpha. If the source already carries an alpha band (RGBA, e.g. a
                    # colorized slope/aspect/TRI product), honour it directly — inferring
                    # transparency from band 0 would wrongly clip valid colours whose red
                    # channel is 0 (e.g. the darkest TRI class rgb(0,38,115)). Otherwise
                    # fall back to "transparent where band 0 == nodata/0".
                    if bands >= 4:
                        alpha = patch_scaled[3, :src_row1c, :src_col1c].astype(np.uint8)
                    else:
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

    # Tight data extent (projected metres) = the max-zoom tile window snapped to the
    # cap grid, clamped to the cap.  Renderers clip tile requests to this so the layer
    # only fetches tiles that were actually written instead of the whole cap.
    bbox = (
        max(CAP_MIN, CAP_MIN + tx_min * tile_span),
        max(CAP_MIN, CAP_MIN + ty_min * tile_span),
        min(CAP_MAX, CAP_MIN + (tx_max + 1) * tile_span),
        min(CAP_MAX, CAP_MIN + (ty_max + 1) * tile_span),
    )
    write_tilemapresource(output_dir, max_zoom, CAP_Z0_RES, bbox)
    print(f"\n  tiles written: {n_written:,}")
    print(
        f"  data bbox (proj m) minx {bbox[0]:.1f}  miny {bbox[1]:.1f}  "
        f"maxx {bbox[2]:.1f}  maxy {bbox[3]:.1f}"
    )
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
    ap.add_argument(
        "input", type=Path, help="Input 8-bit raster (lunar S-pole stereo CRS)"
    )
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
