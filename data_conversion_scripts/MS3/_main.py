#!/usr/bin/env python3
"""
MS3 — Mons Mouton Plateau (Mission 595) data-processing pipeline.

Run the full pipeline or individual steps.  Must be executed from the
**parent `data_conversion_scripts/` directory** via pixi so that GDAL
CLI tools (gdalbuildvrt, gdal2tiles) are on PATH:

    cd /c/Users/bfeist/code/aegis/data_conversion_scripts
    pixi run python MS3/_main.py            # full pipeline
    pixi run python MS3/_main.py --steps 0 1 2
    pixi run python MS3/_main.py --list

Steps
-----
  0  Stage  — remove ArcGIS .sr.lock files; create output folders
  1  Mosaic — 126 NAC frames → VRT
  2  Stretch — VRT → 8-bit grayscale GeoTIFF
  3  Tile   — 8-bit mosaic → PNG pyramid (nac_sfs_ortho)
  4  DEM    — 1 mpp SFS DEM → clean GeoTIFF (demFilePath)
  5  Ellipse — landing-ellipse shapefile → GeoJSON
  6  Inspect — sanity-check 8-bit mosaic and print tilemapresource.xml
  7  Slope  — (optional) colorize float32 slope → RGBA, tile, clean scratch
  8  Cleanup — remove scratch VRT / input list
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path

# Windows consoles default to cp1252, which can't encode the "→" used in banners.
# Force UTF-8 so the pipeline runs without PYTHONUTF8/PYTHONIOENCODING env vars.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# ---------------------------------------------------------------------------
# Canonical paths
# ---------------------------------------------------------------------------

STATIC = Path("C:/Users/bfeist/code/aegis_static")
SRC = STATIC / "A03MP026"
ORTHO_DIR = STATIC / "A03MP026_SFS_1mpp_orthoimages"
OUT = STATIC / "MissionFiles/595"
LAYERS = OUT / "Layers"
DATA = OUT / "Data"

# Inputs
DEM_IN = SRC / "SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif"
SLOPE_IN = SRC / "Slope/SiteUD1_final_adj_5mpp_slp.tif"
ELLIPSE_SHP = SRC / "Ellipse_shapefile/A03MP026_Ellipse.shp"

# Intermediates / outputs
VRT = OUT / "nac_sfs_ortho_mosaic.vrt"
ORTHO_8BIT = OUT / "nac_sfs_ortho_8bit.tif"
ORTHO_TILES = LAYERS / "nac_sfs_ortho"
DEM_OUT = DATA / "sfs_dem_1mpp.tif"
ELLIPSE_OUT = DATA / "a03mp026_ellipse.geojson"
SLOPE_RGBA = OUT / "slope_5mpp_rgba.tif"
SLOPE_TILES = LAYERS / "slope_5mpp"

# MS3 scripts live one level down relative to cwd (data_conversion_scripts/)
MS3 = Path("MS3")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def run(cmd: list[str | Path], *, check: bool = True) -> None:
    """Print and execute a command.

    Forces UTF-8 in child processes so the called scripts (e.g. raster_to_tiles.py)
    don't crash on cp1252 consoles when printing the "→" used in their banners.
    """
    printable = " ".join(str(a) for a in cmd)
    print(f"\n$ {printable}")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    subprocess.run([str(a) for a in cmd], check=check, env=env)


def banner(title: str) -> None:
    width = 70
    print("\n" + "=" * width)
    print(f"  {title}")
    print("=" * width)


# ---------------------------------------------------------------------------
# Individual steps
# ---------------------------------------------------------------------------


def step_0_stage() -> None:
    """Remove ArcGIS .sr.lock files; create output folders."""
    banner("Step 0 — Stage & clean")
    lock_dir = SRC / "Ellipse_shapefile"
    for lock in lock_dir.glob("*.sr.lock"):
        print(f"  removing {lock}")
        lock.unlink()
    for folder in (LAYERS, DATA):
        folder.mkdir(parents=True, exist_ok=True)
        print(f"  mkdir {folder}")


def step_1_mosaic() -> None:
    """Merge 126 LROC NAC frames → VRT mosaic."""
    banner("Step 1 — Mosaic NAC frames → VRT")
    run(
        [
            "python",
            MS3 / "mosaic_rasters.py",
            ORTHO_DIR,
            VRT,
            "--glob",
            "M*-map.tif",
            "--nodata",
            "-3.4e38",
        ]
    )


def step_2_stretch() -> None:
    """Percentile-stretch float radiance → 8-bit GeoTIFF."""
    banner("Step 2 — Stretch radiance → 8-bit grayscale")
    run(
        [
            "python",
            MS3 / "stretch_to_8bit.py",
            VRT,
            ORTHO_8BIT,
            "--pct-low",
            "2",
            "--pct-high",
            "98",
            "--nodata",
            "-3.4e38",
        ]
    )


def step_3_tile() -> None:
    """Tile 8-bit mosaic → PNG pyramid on the shared lunar south-pole cap grid.

    Uses tile_to_cap_grid.py (NOT raster_to_tiles.py) so the tiles land on the
    SAME grid as the production NAC_POLE_SOUTH basemap (origin -931100, z0=12800).
    That lets the mission keep its fixed projOrigin/projResUnitsPerPixel and lets
    every layer overlay the basemap. See MS3/PROBLEM_nac-ortho-scale.md.
    """
    banner("Step 3 — Tile 8-bit mosaic → PNG pyramid (cap grid)")
    run(
        [
            "python",
            MS3 / "tile_to_cap_grid.py",
            ORTHO_8BIT,
            ORTHO_TILES,
        ]
    )


def step_4_dem() -> None:
    """Re-emit 1 mpp SFS DEM as a clean GeoTIFF."""
    banner("Step 4 — DEM → clean GeoTIFF (demFilePath)")
    run(
        [
            "python",
            "geotiff_to_cog.py",
            DEM_IN,
            "--compress",
            "zstd",
            "-o",
            DEM_OUT,
        ]
    )


def step_5_ellipse() -> None:
    """Convert landing-ellipse shapefile → GeoJSON (EPSG:4326)."""
    banner("Step 5 — Ellipse shapefile → GeoJSON")
    run(
        [
            "python",
            MS3 / "shp_to_geojson.py",
            ELLIPSE_SHP,
            ELLIPSE_OUT,
            "--to-epsg",
            "4326",
        ]
    )


def step_6_inspect() -> None:
    """Sanity-check the 8-bit mosaic and print tilemapresource.xml."""
    banner("Step 6 — Verify outputs & read tile-grid resolution")
    run(["python", "inspect_geotiff.py", ORTHO_8BIT])
    tmr = ORTHO_TILES / "tilemapresource.xml"
    if tmr.exists():
        print(f"\n--- {tmr} ---")
        print(tmr.read_text())
    else:
        print(f"  (tilemapresource.xml not found at {tmr} — run Step 3 first)")


def step_7_slope() -> None:
    """(Optional) Colorize slope float32 → RGBA, tile, clean scratch."""
    banner("Step 7 — Slope overlay (optional)")

    banner("Step 7a — Colorize slope float32 → 8-bit RGBA")
    run(
        [
            "python",
            MS3 / "colorize_slope.py",
            SLOPE_IN,
            SLOPE_RGBA,
        ]
    )

    banner("Step 7b — Tile slope RGBA → PNG pyramid (cap grid)")
    # Cap grid like the ortho so the slope overlay registers with the basemap.
    # The 5 mpp slope snaps to cap level z11 (4 m/px) — see tile_to_cap_grid.py.
    run(
        [
            "python",
            MS3 / "tile_to_cap_grid.py",
            SLOPE_RGBA,
            SLOPE_TILES,
        ]
    )

    banner("Step 7c — Remove intermediate slope RGBA")
    if SLOPE_RGBA.exists():
        SLOPE_RGBA.unlink()
        print(f"  removed {SLOPE_RGBA}")
    else:
        print(f"  (not found — skipping): {SLOPE_RGBA}")


def step_8_cleanup() -> None:
    """Remove scratch VRT and input list."""
    banner("Step 8 — Clean up scratch files")
    scratch = [
        VRT,
        OUT / "nac_sfs_ortho_mosaic.inputs.txt",
    ]
    for f in scratch:
        if f.exists():
            f.unlink()
            print(f"  removed {f}")
        else:
            print(f"  (not found — skipping): {f}")


# ---------------------------------------------------------------------------
# AEGIS admin summary
# ---------------------------------------------------------------------------

_TBD = "(run Step 3 first)"
_TBD_SLOPE = "(run Step 7 first)"


def _z0_units_per_pixel(tmr_path: Path, fallback: str = _TBD) -> str:
    """Parse units-per-pixel for order=0 from a tilemapresource.xml."""
    if not tmr_path.exists():
        return fallback
    try:
        root = ET.parse(tmr_path).getroot()
        for ts in root.iter("TileSet"):
            if ts.get("order") == "0":
                raw = ts.get("units-per-pixel", fallback)
                # Trim trailing zeros: "32.00000000000000" → "32.0"
                try:
                    return str(float(raw))
                except ValueError:
                    return raw
    except ET.ParseError:
        return "(parse error)"
    return fallback


def _grid_origin(tmr_path: Path, fallback: str = _TBD) -> tuple[str, str]:
    """Parse the tile-grid <Origin x= y=> from a tilemapresource.xml.

    gdal2tiles -p raster anchors the grid at the input raster's corner, so this
    is the value that must go into mission.projOriginX/Y for Leaflet's L.Proj.CRS
    to line the tiles up with the vectors (see MS3/PROBLEM_nac-ortho-scale.md).
    """
    if not tmr_path.exists():
        return (fallback, fallback)
    try:
        root = ET.parse(tmr_path).getroot()
        origin = root.find("Origin")
        if origin is not None:
            def _trim(raw: str) -> str:
                try:
                    return str(float(raw))
                except (TypeError, ValueError):
                    return raw

            return (_trim(origin.get("x")), _trim(origin.get("y")))
    except ET.ParseError:
        return ("(parse error)", "(parse error)")
    return (fallback, fallback)


def _tile_layer_row(
    name: str,
    layer_dir: Path,
    url_path: str,
    tmr_fallback: str = _TBD,
) -> tuple[str, str, str, str]:
    """Return (name, urlTemplate, projResUnitsPerPixel, exists_marker)."""
    tmr = layer_dir / "tilemapresource.xml"
    res = _z0_units_per_pixel(tmr, fallback=tmr_fallback)
    exists = "✓" if layer_dir.exists() else "✗ (not built)"
    return (name, url_path, res, exists)


def print_aegis_summary(slope_built: bool = False) -> None:
    """Print a compact AEGIS admin input summary."""
    banner("AEGIS Admin Input Summary — Mission 595")

    W = 36  # label column width

    def row(label: str, value: str) -> None:
        print(f"  {label:<{W}} {value}")

    def sep() -> None:
        print(f"  {'─' * (W + 2 + 46)}")

    # ── Mission-level fields ──────────────────────────────────────────────
    # projOrigin + projResUnitsPerPixel are read back from the ortho tile pyramid
    # so they always match the tiles on disk (see MS3/PROBLEM_nac-ortho-scale.md).
    ortho_tmr = ORTHO_TILES / "tilemapresource.xml"
    origin_x, origin_y = _grid_origin(ortho_tmr)
    z0_res = _z0_units_per_pixel(ortho_tmr)
    print("\n  ┌─ Mission (top-level fields) ─────────────────────────────────┐")
    row("landerLocation (lat)", "-84.223397")
    row("landerLocation (lng)", "33.5021945")
    row("planetRadius", "1737400")
    row("projIsCustom", "true")
    row("projEpsg", "IAU2000:30166")
    row("projProj4String", "+proj=stere +lat_0=-90 +lon_0=0 +k=1")
    row("", "  +x_0=0 +y_0=0 +a=1737400 +b=1737400")
    row("", "  +units=m +no_defs")
    row("projBoundsMinX / MinY", "-931100")
    row("projBoundsMaxX / MaxY", "931100")
    row("projOriginX", origin_x)
    row("projOriginY", origin_y)
    row("projResZoomLevel", "0")
    row("projResUnitsPerPixel", z0_res)
    print("  └──────────────────────────────────────────────────────────────┘")

    # ── DEM ───────────────────────────────────────────────────────────────
    print("\n  ┌─ DEM / elevation source ──────────────────────────────────────┐")
    dem_exists = "✓" if DEM_OUT.exists() else "✗ (run Step 4)"
    row("demFilePath", f"Data/sfs_dem_1mpp.tif  {dem_exists}")
    row("demResolution", "1.0")
    print("  └──────────────────────────────────────────────────────────────┘")

    # ── Tile layers ───────────────────────────────────────────────────────
    tile_layers = [
        _tile_layer_row(
            "NAC ortho mosaic",
            ORTHO_TILES,
            "Layers/nac_sfs_ortho/{z}/{x}/{y}.png",
        ),
    ]
    if slope_built or SLOPE_TILES.exists():
        tile_layers.append(
            _tile_layer_row(
                "Slope overlay (optional)",
                SLOPE_TILES,
                "Layers/slope_5mpp/{z}/{x}/{y}.png",
                tmr_fallback=_TBD_SLOPE,
            )
        )

    print('\n  ┌─ Tile sublayers (type: "tile") ────────────────────────────────┐')
    print(f"  {'Layer':<26} {'urlTemplate':<42} {'projResUnitsPerPixel':<22} {'Built'}")
    sep()
    for lname, url, res, exists in tile_layers:
        print(f"  {lname:<26} {url:<42} {res:<22} {exists}")
    print("  └──────────────────────────────────────────────────────────────┘")

    # ── Vector layers ─────────────────────────────────────────────────────
    ellipse_exists = "✓" if ELLIPSE_OUT.exists() else "✗ (run Step 5)"
    print('\n  ┌─ Vector sublayers (type: "vector") ───────────────────────────┐')
    print(
        f"  {'Layer':<26} {'dataPath':<42} {'dataProjection':<16} {'featureProjection':<20} {'Built'}"
    )
    sep()
    print(
        f"  {'Landing ellipse':<26} {'Data/a03mp026_ellipse.geojson':<42}"
        f" {'EPSG:4326':<16} {'IAU2000:30166':<20} {ellipse_exists}"
    )
    print("  └──────────────────────────────────────────────────────────────┘")

    print()


# ---------------------------------------------------------------------------
# Step registry
# ---------------------------------------------------------------------------

STEPS: list[tuple[int, str, str]] = [
    (0, "stage", "Remove .sr.lock files; create output folders"),
    (1, "mosaic", "Merge 126 NAC frames → VRT"),
    (2, "stretch", "Percentile-stretch VRT → 8-bit GeoTIFF"),
    (3, "tile", "Tile 8-bit mosaic → PNG pyramid (nac_sfs_ortho)"),
    (4, "dem", "1 mpp SFS DEM → clean GeoTIFF for demFilePath"),
    (5, "ellipse", "Landing-ellipse shapefile → GeoJSON"),
    (6, "inspect", "Sanity-check outputs; print tilemapresource.xml"),
    (7, "slope", "(optional) Colorize + tile slope overlay"),
    (8, "cleanup", "(optional) Delete VRT scratch files"),
]

STEP_FNS = {
    0: step_0_stage,
    1: step_1_mosaic,
    2: step_2_stretch,
    3: step_3_tile,
    4: step_4_dem,
    5: step_5_ellipse,
    6: step_6_inspect,
    7: step_7_slope,
    8: step_8_cleanup,
}

DEFAULT_STEPS = [0, 1, 2, 3, 4, 5, 6]  # excludes optional 7 & 8

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    step_lines = "\n".join(f"  {n:2d}  {name:<10}  {desc}" for n, name, desc in STEPS)
    parser = argparse.ArgumentParser(
        prog="python MS3/_main.py",
        description=textwrap.dedent("""\
            MS3 — Mons Mouton Plateau (Mission 595) data-processing pipeline.

            Must be run from data_conversion_scripts/ via pixi:
              cd /c/Users/bfeist/code/aegis/data_conversion_scripts
              pixi run python MS3/_main.py
            """),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Available steps:\n{step_lines}",
    )
    parser.add_argument(
        "--steps",
        metavar="N",
        nargs="+",
        type=int,
        help=(
            "Space-separated step numbers to run (e.g. --steps 1 2 3). "
            f"Default: {DEFAULT_STEPS} (steps 7 and 8 are opt-in)."
        ),
    )
    parser.add_argument(
        "--from",
        dest="from_step",
        metavar="N",
        type=int,
        help="Run all default steps starting from N (inclusive).",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Print available steps and exit.",
    )
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print the AEGIS admin input summary table and exit (no pipeline steps run).",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.list:
        print("Available steps:")
        for n, name, desc in STEPS:
            print(f"  {n:2d}  {name:<10}  {desc}")
        sys.exit(0)

    if args.summary:
        print_aegis_summary(slope_built=SLOPE_TILES.exists())
        sys.exit(0)

    if args.steps:
        chosen = sorted(set(args.steps))
    elif args.from_step is not None:
        chosen = [n for n in DEFAULT_STEPS if n >= args.from_step]
    else:
        chosen = DEFAULT_STEPS

    invalid = [n for n in chosen if n not in STEP_FNS]
    if invalid:
        parser.error(
            f"Unknown step number(s): {invalid}. Use --list to see valid steps."
        )

    print(f"Running steps: {chosen}")
    for n in chosen:
        STEP_FNS[n]()

    banner("Pipeline complete")
    print(f"\nOutput root: {OUT}")

    slope_built = 7 in chosen or SLOPE_TILES.exists()
    print_aegis_summary(slope_built=slope_built)


if __name__ == "__main__":
    main()
