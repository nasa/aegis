#!/usr/bin/env python3
"""
MS3 — Mons Mouton Plateau (Mission 49) data-processing pipeline.

Run the full pipeline or individual steps. Must be executed from the
**parent `data_conversion_scripts/` directory** via pixi so that GDAL
CLI tools are on PATH:

        cd /c/Users/bfeist/code/aegis/data_conversion_scripts
        pixi run python MS3/_main.py
        pixi run python MS3/_main.py --steps 0 1 2
        pixi run python MS3/_main.py --list

Steps
-----
    0  Stage    — remove ArcGIS .sr.lock files; create output folders
    1  NAC      — stretch each NAC frame and tile it to its own cap-grid layer
    2  DEM      — 1 mpp SFS DEM → clean GeoTIFF (demFilePath)
    3  Ellipse  — landing-ellipse shapefile → GeoJSON
    4  Inspect  — summarize generated NAC layer pyramids
    5  Slope    — (optional) colorize float32 slope → RGBA, tile, clean scratch
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path

# Always invoke sub-scripts with the same interpreter that is running this
# file, so the uv venv (rasterio, numpy, PIL, etc.) is available.
PYTHON = sys.executable

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

STATIC = Path("F:/_repos/aegis_static/MS3")
SRC = STATIC / "A03MP026"
ORTHO_DIR = STATIC / "A03MP026_SFS_1mpp_orthoimages"
OUT = Path("F:/_repos/aegis_static/missionFiles/49")
LAYERS = OUT / "Layers"
DATA = OUT / "Data"

# Inputs
DEM_IN = SRC / "SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif"
SLOPE_IN = SRC / "Slope/SiteUD1_final_adj_5mpp_slp.tif"
ELLIPSE_SHP = SRC / "Ellipse_shapefile/A03MP026_Ellipse.shp"

# Intermediates / outputs
DEM_OUT = DATA / "sfs_dem_1mpp.tif"
ELLIPSE_OUT = DATA / "a03mp026_ellipse.geojson"
SLOPE_RGBA = OUT / "slope_5mpp_rgba.tif"
SLOPE_TILES = LAYERS / "slope_5mpp"

# MS3 scripts live one level down relative to cwd (data_conversion_scripts/)
MS3 = Path("MS3")
NAC_PROCESSING = MS3 / "NAC_processing"

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


def _nac_frame_paths() -> list[Path]:
    return sorted(
        p
        for p in ORTHO_DIR.glob("M*-map.tif")
        if p.is_file() and not p.name.startswith("mm2-")
    )


def step_1_nac_layers() -> None:
    """Stretch each NAC frame and tile it into its own cap-grid layer."""
    banner("Step 1 — NAC frames -> per-frame cap-grid layer pyramids")
    cmd = [
        PYTHON,
        NAC_PROCESSING / "build_nac_layer_pyramids.py",
        ORTHO_DIR,
        LAYERS,
    ]
    if _OVERWRITE:
        cmd.append("--overwrite")
    run(cmd)


def step_2_dem() -> None:
    """Re-emit 1 mpp SFS DEM as a clean GeoTIFF."""
    banner("Step 2 — DEM → clean GeoTIFF (demFilePath)")
    run(
        [
            PYTHON,
            "geotiff_to_cog.py",
            DEM_IN,
            "--compress",
            "zstd",
            "-o",
            DEM_OUT,
        ]
    )


def step_3_ellipse() -> None:
    """Convert landing-ellipse shapefile → GeoJSON (EPSG:4326)."""
    banner("Step 3 — Ellipse shapefile → GeoJSON")
    run(
        [
            PYTHON,
            MS3 / "shp_to_geojson.py",
            ELLIPSE_SHP,
            ELLIPSE_OUT,
            "--to-epsg",
            "4326",
        ]
    )


def step_4_inspect() -> None:
    """Summarize generated NAC layer pyramids and print one sample tilemapresource.xml."""
    banner("Step 4 — Verify per-frame NAC layer outputs")
    frames = _nac_frame_paths()
    built = []
    missing = []
    for frame in frames:
        layer_dir = LAYERS / frame.stem
        tmr = layer_dir / "tilemapresource.xml"
        if tmr.exists():
            built.append(layer_dir)
        else:
            missing.append(layer_dir)

    print(f"  expected NAC layers: {len(frames)}")
    print(f"  built NAC layers:    {len(built)}")
    print(f"  missing NAC layers:  {len(missing)}")

    if built:
        sample = built[0] / "tilemapresource.xml"
        print(f"\n--- sample {sample} ---")
        print(sample.read_text())

    if missing:
        print("\n  Missing layer folders:")
        for layer_dir in missing[:10]:
            print(f"    {layer_dir.name}")
        if len(missing) > 10:
            print(f"    ... and {len(missing) - 10} more")


def step_6_insert_nac_layers() -> None:
    """Call the AEGIS API to insert a sublayer record for every built NAC frame."""
    banner("Step 6 — Insert NAC frame sublayers into AEGIS via API")
    run(
        [
            PYTHON,
            MS3 / "insert_nac_layers.py",
            "--mission-id",
            str(49),
        ]
    )


def step_7_slope() -> None:
    """(Optional) Colorize slope float32 → RGBA, tile, clean scratch."""
    banner("Step 5 — Slope overlay (optional)")

    banner("Step 5a — Colorize slope float32 → 8-bit RGBA")
    run(
        [
            PYTHON,
            MS3 / "colorize_slope.py",
            SLOPE_IN,
            SLOPE_RGBA,
        ]
    )

    banner("Step 5b — Tile slope RGBA → PNG pyramid (cap grid)")
    # Cap grid like the ortho so the slope overlay registers with the basemap.
    # The 5 mpp slope snaps to cap level z11 (4 m/px) — see tile_to_cap_grid.py.
    run(
        [
            PYTHON,
            MS3 / "tile_to_cap_grid.py",
            SLOPE_RGBA,
            SLOPE_TILES,
        ]
    )

    banner("Step 5c — Remove intermediate slope RGBA")
    if SLOPE_RGBA.exists():
        SLOPE_RGBA.unlink()
        print(f"  removed {SLOPE_RGBA}")
    else:
        print(f"  (not found — skipping): {SLOPE_RGBA}")


# ---------------------------------------------------------------------------
# AEGIS admin summary
# ---------------------------------------------------------------------------

_TBD = "(run Step 1 first)"
_TBD_SLOPE = "(run Step 5 first)"


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
    banner("AEGIS Admin Input Summary — Mission 49")

    W = 36  # label column width

    def row(label: str, value: str) -> None:
        print(f"  {label:<{W}} {value}")

    def sep() -> None:
        print(f"  {'─' * (W + 2 + 46)}")

    # ── Mission-level fields ──────────────────────────────────────────────
    sample_layer = next(
        (
            LAYERS / p.stem
            for p in _nac_frame_paths()
            if (LAYERS / p.stem / "tilemapresource.xml").exists()
        ),
        None,
    )
    sample_tmr = (
        sample_layer / "tilemapresource.xml" if sample_layer else Path("missing")
    )
    origin_x, origin_y = _grid_origin(sample_tmr)
    z0_res = _z0_units_per_pixel(sample_tmr)
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
    nac_frames = _nac_frame_paths()
    built_nac = [p for p in nac_frames if (LAYERS / p.stem).exists()]
    if slope_built or SLOPE_TILES.exists():
        slope_row = _tile_layer_row(
            "Slope overlay (optional)",
            SLOPE_TILES,
            "Layers/slope_5mpp/{z}/{x}/{y}.png",
            tmr_fallback=_TBD_SLOPE,
        )
    else:
        slope_row = None

    print('\n  ┌─ Tile sublayers (type: "tile") ────────────────────────────────┐')
    print(
        f"  {'Layer group':<26} {'urlTemplate':<42} {'projResUnitsPerPixel':<22} {'Built'}"
    )
    sep()
    print(
        f"  {'Per-frame NAC layers':<26} "
        f"{'Layers/<frame>/{z}/{x}/{y}.png':<42} "
        f"{z0_res:<22} "
        f"{len(built_nac)}/{len(nac_frames)}"
    )
    if nac_frames:
        print(
            f"  {'Example layer folder':<26} {nac_frames[0].stem:<42} {'':<22} {'✓' if (LAYERS / nac_frames[0].stem).exists() else '✗'}"
        )
    if slope_row:
        lname, url, res, exists = slope_row
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
    (1, "nac", "Stretch each NAC frame and tile it to its own layer pyramid"),
    (2, "dem", "1 mpp SFS DEM → clean GeoTIFF for demFilePath"),
    (3, "ellipse", "Landing-ellipse shapefile → GeoJSON"),
    (4, "inspect", "Summarize generated NAC layer pyramids"),
    (5, "slope", "(optional) Colorize + tile slope overlay"),
    (6, "insert-layers", "Insert NAC frame sublayers into AEGIS via API"),
]

STEP_FNS = {
    0: step_0_stage,
    1: step_1_nac_layers,
    2: step_2_dem,
    3: step_3_ellipse,
    4: step_4_inspect,
    5: step_7_slope,
    6: step_6_insert_nac_layers,
}

DEFAULT_STEPS = [0, 1, 2, 3, 4, 6]

# Set to True by --overwrite CLI flag; forwarded to step 1.
_OVERWRITE = False

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    step_lines = "\n".join(f"  {n:2d}  {name:<10}  {desc}" for n, name, desc in STEPS)
    parser = argparse.ArgumentParser(
        prog="python MS3/_main.py",
        description=textwrap.dedent("""\
            MS3 — Mons Mouton Plateau (Mission 49) data-processing pipeline.

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
            f"Default: {DEFAULT_STEPS} (step 5 is opt-in)."
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
        "--overwrite",
        action="store_true",
        help="Re-tile NAC frames even if their layer already exists (forwarded to step 1).",
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

    global _OVERWRITE
    _OVERWRITE = args.overwrite

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

    slope_built = 5 in chosen or SLOPE_TILES.exists()
    print_aegis_summary(slope_built=slope_built)


if __name__ == "__main__":
    main()
