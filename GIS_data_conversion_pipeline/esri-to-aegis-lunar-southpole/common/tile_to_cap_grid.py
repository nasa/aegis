#!/usr/bin/env python3
"""Tile a raster onto the AEGIS lunar **south-pole cap grid** — the shared map
definition used by the production ``NAC_POLE_SOUTH_CM_AVG_MERGE`` basemap.

Every layer tiled this way overlays that basemap pixel-for-pixel in OpenLayers.
Uses GDAL's native C++ tiler (``gdal raster tile``, GDAL >= 3.11) restricted to
the data's tile window — multi-threaded (``-j ALL_CPUS`` by default) and fast
(the A03MP026 NAC ortho tiles in ~6 s).

    Origin              = (-931100, -931100)        # cap bottom-left
    Extent              = -931100 .. 931100  (both axes)
    z0 units-per-pixel  = 12800                      # TMS (y from bottom)

The z0 resolution (12800) must equal the mission's ``projResUnitsPerPixel``
(with ``projResZoomLevel = 0``): OpenLayers builds its per-mission resolution pyramid
as ``12800 / 2**z`` (``buildLegacyResolutions``) and uses it to compute tile indices.
Every layer must be cut on this same z0 or OL requests non-existent indices → 404s.

Each layer is cut to its **own native resolution** (an OpenLayers per-layer pyramid):
the depth ``max_zoom = ceil(log2(z0_res / r_in))`` is per-layer, while origin and z0
stay shared.  Using ``ceil`` (not nearest) guarantees the stored grid is never coarser
than the source — worst case it oversamples onto a finer rung.  A 1 m/px source tiles to
z14; there is no global zoom clamp.

How it works
------------
Cutting onto the cap grid naively means tiling a ~1.86M x 1.86M px canvas that is almost
entirely empty.  Instead this script:

  1. wraps the (small) input in a **virtual** full-cap VRT anchored at the cap origin
     (``gdalbuildvrt -te -931100 -931100 <cap_top> <cap_top> -tr <res> <res>``),
  2. computes the exact tile-index window the data actually covers at max zoom,
  3. runs ``gdal raster tile`` restricted to that window (``--min-x/--max-x/--min-y/--max-y``
     are XYZ/top-down even though ``--convention tms`` controls the output filenames),
  4. writes a cap-grid ``tilemapresource.xml`` with a **tight projected-metre** ``<BoundingBox>``
     (the new C++ tiler does not emit one; AEGIS/``register.py`` read it).

Alignment note
--------------
The cap is not a whole number of tiles wide.  The production basemap anchors at the
BOTTOM-left (-931100) and lets the partial tile fall off the TOP.  ``gdal raster tile``
instead anchors at the top-left and flips Y→TMS using the tile count *at each zoom*, so the
VRT is padded top/right to ``2**max_zoom`` tiles (``cap_top``) — a whole number of tiles at
**every** level, not just at max zoom.  Every level then halves exactly, TMS row 0 stays on
-931100 all the way up, and the layer keeps the bottom-anchored grid the basemap uses.
Padding only to the next whole tile at max zoom leaves an odd row count that re-rounds on
each halving, which walks the coarser levels off the grid (up to a tile of northward shift).

Usage
-----
    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/common/tile_to_cap_grid.py <input_8bit.tif> <output_dir>

Must run under ``pixi run`` so the conda-forge GDAL binaries (``gdal``/``gdalbuildvrt``) are
on PATH.  The cap-grid / projection constants live in ``config.py`` at the pipeline root, so
the tiler and the AEGIS admin summary can never drift apart.
"""

from __future__ import annotations

import argparse
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import rasterio

# Import the shared projection profile from the pipeline root (one level up from
# common/). This file is run as a script via subprocess, so common/ — not the
# pipeline root — is on sys.path[0]; add the root explicitly before importing.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (  # noqa: E402
    CAP_MIN,
    CAP_MAX,
    TILE,
    CAP_Z0_RES,
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


def _which(name: str) -> str:
    """Resolve a GDAL CLI on PATH or exit with a "run under pixi" hint."""
    p = shutil.which(name) or shutil.which(name + ".exe")
    if not p:
        print(
            f"ERROR: '{name}' not found on PATH. Run under `pixi run` so the "
            "conda-forge GDAL binaries are available.",
            file=sys.stderr,
        )
        sys.exit(1)
    return p


def write_tilemapresource(
    out_dir: Path,
    max_zoom: int,
    z0_res: float,
    bbox: tuple[float, float, float, float] | None = None,
) -> None:
    """Emit a cap-grid tilemapresource.xml.

    ``bbox`` is the layer's TIGHT data extent ``(minx, miny, maxx, maxy)`` in cap-grid
    projected metres, and is written to ``<BoundingBox>`` **as projected metres** — the
    OpenLayers-native form.  OL clips tile requests to a layer/source ``extent`` in the
    projection's own coordinates, so the projected box is what the consumer wants.  ``<SRS>``
    / ``<Origin>`` / ``<TileSet units-per-pixel>`` are projected metres too, so the whole
    document is in one unit system.  When ``bbox`` is ``None`` it falls back to the full cap.
    """
    minx, miny, maxx, maxy = (
        bbox if bbox is not None else (CAP_MIN, CAP_MIN, CAP_MAX, CAP_MAX)
    )
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


def tile_raster(
    input_path: Path,
    output_dir: Path,
    resampling: str = "average",
) -> None:
    gdal = _which("gdal")
    gdalbuildvrt = _which("gdalbuildvrt")

    with rasterio.open(input_path) as src:
        bounds = src.bounds
        r_in = float(src.res[0])

    # Cut each layer to its OWN native resolution — an OpenLayers per-layer pyramid.
    # Origin (CAP_MIN) and z0 (CAP_Z0_RES) stay shared so the layer still aligns to the
    # mission cap grid and overlays the basemap; only the depth (max_zoom) is per-layer.
    # ceil() picks the next-deeper rung so out_res <= r_in: a layer is never stored coarser
    # than its source. The depth is self-limiting at the source resolution (1 m/px → z14);
    # there is no global zoom clamp. The app builds resolutions as 12800 / 2**z for z in
    # 0..maxNativeZoom, so a deeper layer "just works".
    z0_res = CAP_Z0_RES
    max_zoom = max(0, math.ceil(math.log2(z0_res / r_in)))
    out_res = z0_res / 2**max_zoom
    tile_span = TILE * out_res

    dminx, dminy, dmaxx, dmaxy = (
        bounds.left,
        bounds.bottom,
        bounds.right,
        bounds.top,
    )

    # Padded cap top — the cap is NOT a whole number of tiles wide, so the canvas has to be
    # padded top/right for the bottom-left to stay exactly on CAP_MIN. gdal raster tile
    # anchors at the TOP-left and flips Y→TMS using the tile count at EACH zoom, which it
    # re-derives as ceil(rows / 2) per level. Padding only to the next whole tile at max zoom
    # is therefore not enough: an odd row count at max zoom re-rounds on the way up and walks
    # the bottom row off CAP_MIN, shifting every coarser level north by up to a tile (the
    # "layer jumps when you zoom out past its native level" bug). Padding to 2**max_zoom tiles
    # — one single z0 tile of 256 * CAP_Z0_RES metres, which always covers the cap — makes
    # every level halve exactly, so TMS row 0 sits on CAP_MIN at every zoom.
    n_cap_tiles = 2**max_zoom
    cap_top = CAP_MIN + n_cap_tiles * tile_span

    # Tile-index window the data actually covers at max_zoom.
    #   X: bottom-left anchored at CAP_MIN, increasing east.
    #   Y: XYZ/top-down anchored at the padded cap_top (what gdal raster tile expects;
    #      --convention tms flips the output filenames).
    xmin = int((dminx - CAP_MIN) // tile_span)
    xmax = int((dmaxx - CAP_MIN) // tile_span)
    ymin = int((cap_top - dmaxy) // tile_span)
    ymax = int((cap_top - dminy) // tile_span)

    print("=" * 64)
    print("Tile → AEGIS lunar south-pole cap grid (gdal raster tile)")
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
    print(f"  tile window @z{max_zoom}    x {xmin}..{xmax}   y(xyz) {ymin}..{ymax}")
    print()

    output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        vrt = Path(td) / "fullcap.vrt"
        subprocess.run(
            [
                gdalbuildvrt,
                "-overwrite",
                "-te",
                str(CAP_MIN),
                str(CAP_MIN),
                str(cap_top),
                str(cap_top),
                "-tr",
                str(out_res),
                str(out_res),
                str(vrt),
                str(input_path),
            ],
            check=True,
        )
        cmd = [
            gdal,
            "raster",
            "tile",
            "--tiling-scheme",
            "raster",
            "--convention",
            "tms",
            "--resampling",
            resampling,
            "--overview-resampling",
            resampling,
            # Force an alpha channel so transparency is honoured for single-band inputs
            # (hillshade, single-band NAC): gdal derives alpha from the VRT's nodata.
            # RGBA colorized products (slope/aspect/tri) already carry an alpha band,
            # which gdal preserves — so colours with red=0 aren't clipped.
            "--add-alpha",
            "--skip-blank",
            # No HTML viewers — the layer folder is tiles + our tilemapresource.xml only
            # (a stray openlayers.html would get registered/zipped/uploaded as cruft).
            "--webviewer",
            "none",
            "--min-zoom",
            "0",
            "--max-zoom",
            str(max_zoom),
            "--min-x",
            str(xmin),
            "--max-x",
            str(xmax),
            "--min-y",
            str(ymin),
            "--max-y",
            str(ymax),
            "-i",
            str(vrt),
            "-o",
            str(output_dir),
        ]
        print("$ " + " ".join(cmd) + "\n", flush=True)
        subprocess.run(cmd, check=True)

    # Tight data extent (projected metres) = the tile window snapped to the cap grid,
    # clamped to the cap. Convention-independent (X and the bottom-anchored Y span both
    # come straight from tile_span). Renderers clip tile requests to this box so the layer
    # only fetches tiles that were actually written instead of the whole cap.
    y_row_min = int((dminy - CAP_MIN) // tile_span)
    y_row_max = int((dmaxy - CAP_MIN) // tile_span)
    bbox = (
        max(CAP_MIN, CAP_MIN + xmin * tile_span),
        max(CAP_MIN, CAP_MIN + y_row_min * tile_span),
        min(CAP_MAX, CAP_MIN + (xmax + 1) * tile_span),
        min(CAP_MAX, CAP_MIN + (y_row_max + 1) * tile_span),
    )
    write_tilemapresource(output_dir, max_zoom, CAP_Z0_RES, bbox)

    n = sum(1 for _ in output_dir.rglob("*.png"))
    print(f"\n  tiles written: {n:,}")
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
        description="Tile a raster onto the AEGIS lunar south-pole cap grid (gdal raster tile).",
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
        help="Max-zoom + overview resampling (default: average)",
    )
    args = ap.parse_args()

    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    tile_raster(args.input, args.output_dir, resampling=args.resampling)


if __name__ == "__main__":
    main()
