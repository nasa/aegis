#!/usr/bin/env python3
"""Tile a raster onto the AEGIS lunar **south-pole cap grid** — the shared map
definition used by the production ``NAC_POLE_SOUTH_CM_AVG_MERGE`` basemap (and
mission 25). Every layer tiled this way overlays that basemap pixel-for-pixel.

Why this exists
---------------
``raster_to_tiles.py`` runs ``gdal2tiles -p raster``, which anchors the tile grid
to the **input raster's own corner**. That produces a self-consistent pyramid,
but on a grid unique to that one raster — so the tiles do **not** line up with
the existing basemap, and the mission's ``projOriginX/Y`` / ``projResUnitsPerPixel``
would have to be changed to match. In AEGIS that origin is fixed by the basemap
and cannot change, so **new tilesets must be cut on the cap grid**:

    Origin              = (-931100, -931100)        # cap bottom-left
    Extent              = -931100 .. 931100  (both axes)
    z0 units-per-pixel  = 12800  ->   z13 = 1.5625  # 14 levels, TMS (y from bottom)

The z0 resolution (12800) must equal the mission's ``projResUnitsPerPixel`` (with
``projResZoomLevel = 0``): Leaflet builds the resolution pyramid ``12800 / 2**z`` *per
mission* (not per layer) and computes tile indices from it, so every layer must be cut on
this same z0 or Leaflet requests non-existent tile indices (404s).

How it works (fast)
-------------------
Cutting onto the cap grid naively means tiling a 1,862,200 x 1,862,200 px canvas
that is almost entirely empty — the stock ``gdal2tiles`` chokes building that
job list, and materialising the canvas as a real GeoTIFF overflows the 4 GiB
TIFF limit (that was the corrupt ``*_fullcap.tif`` found on disk). Instead this
script:

  1. wraps the (small) input in a **virtual** full-cap VRT anchored at the cap
     origin (``gdalbuildvrt -te -931100 -931100 931100 931100 -tr <res> <res>``),
  2. computes the exact tile-index window the data actually covers at max zoom,
  3. runs the fast C++ ``gdal raster tile`` restricted to that window
     (``--min-x/--max-x/--min-y/--max-y`` are in XYZ/top-down convention even
     though ``--convention tms`` controls the output filenames),
  4. writes a ``tilemapresource.xml`` describing the cap grid, with the BoundingBox
     set to the **full cap** (-931100 .. 931100), matching the basemap / mission-16
     layers (the new C++ tiler does not emit one; the AEGIS admin import UI reads it,
     and a full-cap box is what makes the layer render — see the module note below).

Result: the NAC ortho for A03MP026 tiles in ~6 s instead of stalling.

Usage
-----
    cd data_conversion_scripts
    pixi run python MS3/tile_to_cap_grid.py <input_8bit.tif> <output_dir>

See MS3/PROBLEM_nac-ortho-scale.md for the full investigation.
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

# Windows consoles default to cp1252; force UTF-8 so banners don't crash.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# --- AEGIS lunar south-pole cap grid (the shared "map definition") -----------
CAP_MIN = -931100.0
CAP_MAX = 931100.0
TILE = 256

# z0 (top of the pyramid) resolution, in metres / pixel. This is the single value
# that MUST equal the mission's ``projResUnitsPerPixel`` (with ``projResZoomLevel = 0``),
# because Leaflet builds its per-mission resolution pyramid as ``CAP_Z0_RES / 2**z``
# and uses it to compute tile indices: tile_x = floor((projX - originX) / (res*256)).
# If the tiles on disk are cut on a different z0, Leaflet asks for indices that don't
# exist -> 404s (see MS3/PROBLEM_nac-ortho-scale.md §"wrong resolution").
#
# It is **12800** to match the production ``NAC_POLE_SOUTH_CM_AVG_MERGE`` basemap and the
# existing mission record (projResUnitsPerPixel = 12800). Leaflet's resolution pyramid is
# per-mission, NOT per-layer, so every tiled layer in the mission must use this same z0.
# Note: 12800 is not a power-of-two multiple of 1.0 (12800/2**13 = 1.5625 m/px), so the
# deepest integer level is ~1.56 m/px, not exactly 1.0 — that is fine; the source raster is
# resampled to the nearest cap level (see ``max_zoom`` below).
CAP_Z0_RES = 12800.0

# How deep the cap pyramid is allowed to go. z0=12800 -> z13 = 1.5625 m/px, which is finer
# than any source we tile, so 13 levels is plenty. (Kept explicit instead of derived from a
# fixed native res, because z0 is no longer a clean power-of-two multiple of 1 m.)
CAP_MAX_ZOOM = 13

# SRS string matching the existing basemap / mission-25 layers (cosmetic — AEGIS
# does not parse it at runtime; kept for tooling that does).
CAP_SRS = (
    'PROJCS["PolarStereographic_Moon",GEOGCS["GCS_Moon",DATUM["D_Moon",'
    'SPHEROID["Moon",1737400,0]],PRIMEM["Reference_Meridian",0],'
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]]],'
    'PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",-90],'
    'PARAMETER["central_meridian",0],PARAMETER["false_easting",0],'
    'PARAMETER["false_northing",0],UNIT["metre",1],'
    'AXIS["Easting",NORTH],AXIS["Northing",NORTH]]'
)


def _which(name: str) -> str:
    p = shutil.which(name) or shutil.which(name + ".exe")
    if not p:
        print(
            f"ERROR: '{name}' not found on PATH. Run under `pixi run` so the "
            "conda-forge GDAL binaries are available.",
            file=sys.stderr,
        )
        sys.exit(1)
    return p


def write_tilemapresource(out_dir: Path, max_zoom: int, z0_res: float) -> None:
    """Emit a cap-grid tilemapresource.xml (Origin AND BoundingBox = the full cap).

    The BoundingBox is the **whole polar cap** (-931100 .. 931100), NOT the data
    extent. This matches the production basemap and the existing mission-16 layers,
    and it is required for the layer to render: AEGIS imports this BoundingBox into
    ``sublayer.boundingBox`` and passes it to Leaflet's ``L.tileLayer({bounds})``,
    which Leaflet interprets as a *lat/lng* box. The cap extent, read as lat/lng, is
    a huge region that always overlaps the viewport, so tiles load. A tight data
    extent (e.g. 94509..99630) read as lat/lng never overlaps the real south-pole
    viewport, so Leaflet requests **no tiles at all** (the cause of the blank layer).

    units-per-pixel per zoom is the *cap* resolution (z0_res / 2**z) so the values
    match the existing basemap exactly regardless of which level this layer stops at.
    """
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


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Tile a raster onto the AEGIS lunar south-pole cap grid.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("input", type=Path, help="Input 8-bit raster (on the lunar S-pole stereo CRS)")
    ap.add_argument("output_dir", type=Path, help="Output tile directory")
    ap.add_argument("--resampling", default="average",
                    help="Max-zoom + overview resampling (default: average)")
    args = ap.parse_args()

    if not args.input.exists():
        print(f"ERROR: input not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    gdal = _which("gdal")
    gdalbuildvrt = _which("gdalbuildvrt")

    # Cap grid geometry. The cap pyramid is z0_res / 2**z, with z0 fixed to match the
    # mission's projResUnitsPerPixel (12800) — see CAP_Z0_RES. It is NOT derived from the
    # native 1 m resolution any more, because 12800 is not a power-of-two multiple of 1 m.
    cap_max_zoom = CAP_MAX_ZOOM                                 # 13
    z0_res = CAP_Z0_RES                                         # 12800

    # Snap the layer to the cap level whose resolution is closest to its own, so a coarse
    # raster is never blown up onto a giant fine canvas. out_res is always a cap level
    # (z0_res / 2**z). For the 1 m NAC ortho the closest level is z13 (1.5625 m/px); for a
    # ~5 m slope overlay it is z11 (6.25 m/px).
    with rasterio.open(args.input) as ds:
        b = ds.bounds
        dminx, dminy, dmaxx, dmaxy = b.left, b.bottom, b.right, b.top
        r_in = float(ds.res[0])
    max_zoom = min(cap_max_zoom, max(0, round(math.log2(z0_res / r_in))))
    out_res = z0_res / 2 ** max_zoom            # cap resolution this layer tiles at
    tile_span = TILE * out_res                  # metres per tile at max_zoom

    # The cap is NOT a whole number of tiles wide: (931100 - -931100) / tile_span has a
    # fractional remainder (1,862,200 m / 256 m = 7274.21875 tiles at z13). That partial
    # tile is the whole ballgame for alignment:
    #
    #   * The production basemap (gdal2tiles -p raster) anchors its grid at the
    #     BOTTOM-left (origin -931100) and lets the partial tile fall off the TOP. This
    #     is exactly what Leaflet assumes: tile_y = floor((projY - originY) / (res*256)).
    #   * `gdal raster tile` instead anchors at the TOP-left, lets the partial tile fall
    #     off the BOTTOM, then flips Y->TMS using the tile *count*.
    #
    # Fed the exact cap extent, those two grids disagree by the empty part of the partial
    # tile (ceil(N)*tile_span - cap_height = 200 m at z13) and the ortho lands ~200 m too
    # far south. Fix: pad the VRT's top/right out to a whole number of tiles so the
    # BOTTOM-left stays exactly on -931100. gdal's top-anchored Y-flip then resolves to
    # the same bottom-anchored grid the basemap (and Leaflet) use.
    n_tiles = math.ceil((CAP_MAX - CAP_MIN) / tile_span)
    cap_top = CAP_MIN + n_tiles * tile_span     # padded top; keeps CAP_MIN tile-aligned

    xmin = int((dminx - CAP_MIN) // tile_span)
    xmax = int((dmaxx - CAP_MIN) // tile_span)
    # --min-y/--max-y are XYZ (top-down); anchor at the PADDED top so the TMS flip lands
    # tile y=0 exactly on CAP_MIN (the basemap's bottom edge), not 200 m below it.
    ymin = int((cap_top - dmaxy) // tile_span)
    ymax = int((cap_top - dminy) // tile_span)

    print("=" * 64)
    print("Tile → AEGIS lunar south-pole cap grid")
    print("=" * 64)
    print(f"  input              {args.input}")
    print(f"  data extent        E {dminx:.1f}..{dmaxx:.1f}  N {dminy:.1f}..{dmaxy:.1f}")
    print(f"  cap origin         ({CAP_MIN:.0f}, {CAP_MIN:.0f})")
    print(f"  input res          {r_in:g} m/px  ->  cap level z{max_zoom} ({out_res:g} m/px), z0 units/px = {z0_res:.0f}")
    print(f"  tile window @z{max_zoom}    x {xmin}..{xmax}   y(xyz) {ymin}..{ymax}")
    print()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        vrt = Path(td) / "fullcap.vrt"
        subprocess.run(
            [gdalbuildvrt, "-overwrite",
             "-te", str(CAP_MIN), str(CAP_MIN), str(cap_top), str(cap_top),
             "-tr", str(out_res), str(out_res),
             str(vrt), str(args.input)],
            check=True,
        )
        cmd = [
            gdal, "raster", "tile",
            "--tiling-scheme", "raster",
            "--convention", "tms",
            "--resampling", args.resampling,
            "--overview-resampling", args.resampling,
            "--skip-blank",
            "--min-zoom", "0", "--max-zoom", str(max_zoom),
            "--min-x", str(xmin), "--max-x", str(xmax),
            "--min-y", str(ymin), "--max-y", str(ymax),
            "-i", str(vrt), "-o", str(args.output_dir),
        ]
        print("$ " + " ".join(cmd) + "\n")
        subprocess.run(cmd, check=True)

    write_tilemapresource(args.output_dir, max_zoom, z0_res)

    n = sum(1 for _ in args.output_dir.rglob("*.png"))
    print(f"\n  tiles written: {n:,}")
    print(f"  tilemapresource.xml: {args.output_dir / 'tilemapresource.xml'}")
    print("\n  Cap-grid layer — overlays the existing basemap; mission projOrigin/"
          "projResUnitsPerPixel stay unchanged (-931100 / 12800).")


if __name__ == "__main__":
    main()
