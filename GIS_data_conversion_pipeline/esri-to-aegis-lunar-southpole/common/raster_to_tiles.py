"""Generate a TMS raster tile pyramid from a GeoTIFF using gdal2tiles.

This is the standard pipeline for new AEGIS missions (tile_grid_version 2).
It produces a self-consistent tile directory with a correct tilemapresource.xml.

Prerequisites:
    - gdal2tiles.py on PATH — provided by the pixi env (conda-forge GDAL), so run
      under ``pixi run`` from GIS_data_conversion_pipeline/

Usage:
    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/common/raster_to_tiles.py <input.tif> <output_dir>
    pixi run python esri-to-aegis-lunar-southpole/common/raster_to_tiles.py <input.tif> <output_dir> --profile mercator --zoom 0-17

Examples:
    # Lunar south pole raster (custom projection) — use 'raster' profile:
    pixi run python esri-to-aegis-lunar-southpole/common/raster_to_tiles.py \\
        NAC_merge.tif tiles/ --profile raster

    # Earth mission (Web Mercator) — use 'mercator' profile (see ../../mercator/):
    pixi run python esri-to-aegis-lunar-southpole/common/raster_to_tiles.py \\
        imagery.tif tiles/ --profile mercator

    # Resample source raster to specific resolution BEFORE tiling:
    pixi run gdalwarp -tr 1.0 1.0 -r bilinear input.tif resampled.tif

Notes:
    - ALWAYS use this script (or gdal2tiles directly) for new missions.
    - Do NOT post-process or reorganise tile directories after generation.
    - The output tilemapresource.xml will correctly describe the tile grid.
    - Set tile_grid_version = 2 in the mission database for these tilesets.
    - See TILESET-MIGRATION-STRATEGY.md for the full migration plan.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Force UTF-8 stdout/stderr — avoids UnicodeEncodeError on default cp1252 terminals.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def find_gdal2tiles() -> str | None:
    """Locate gdal2tiles.py on PATH."""
    # Try the standard command name first
    for name in ("gdal2tiles.py", "gdal2tiles"):
        path = shutil.which(name)
        if path:
            return path
    return None


def run_gdal2tiles(
    input_path: Path,
    output_dir: Path,
    profile: str = "raster",
    zoom: str | None = None,
    resampling: str = "average",
    tile_size: int = 256,
    processes: int | None = None,
) -> None:
    """Run gdal2tiles.py with the given parameters."""

    gdal2tiles = find_gdal2tiles()
    if not gdal2tiles:
        print(
            "ERROR: gdal2tiles.py not found on PATH.\n"
            "Install GDAL or use the aegis/gdal Docker image.",
            file=sys.stderr,
        )
        sys.exit(1)

    cmd = [
        gdal2tiles,
        "--profile",
        profile,
        "--resampling",
        resampling,
        "--tilesize",
        str(tile_size),
        "--webviewer",
        "none",  # Don't generate viewer HTML
    ]

    if zoom:
        cmd.extend(["--zoom", zoom])

    if processes and processes > 1:
        cmd.extend(["--processes", str(processes)])

    cmd.extend([str(input_path), str(output_dir)])

    print("-" * 60)
    print("Running gdal2tiles")
    print("-" * 60)
    print(f"  Command: {' '.join(cmd)}")
    print(f"  Profile: {profile}")
    print(f"  Tile size: {tile_size}")
    if zoom:
        print(f"  Zoom range: {zoom}")
    print()

    t0 = time.time()
    result = subprocess.run(cmd, capture_output=False)

    if result.returncode != 0:
        print(
            f"\nERROR: gdal2tiles exited with code {result.returncode}", file=sys.stderr
        )
        sys.exit(result.returncode)

    elapsed = time.time() - t0
    print(f"\n  Done in {elapsed:.0f}s")

    # Verify output
    xml_path = output_dir / "tilemapresource.xml"
    if xml_path.exists():
        print(f"  tilemapresource.xml: OK")
    else:
        print(f"  WARNING: tilemapresource.xml not found in output", file=sys.stderr)

    # Count tiles
    tile_count = sum(1 for _ in output_dir.rglob("*.png")) + sum(
        1 for _ in output_dir.rglob("*.jpg")
    )
    print(f"  Tiles generated: {tile_count:,}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a TMS raster tile pyramid from a GeoTIFF.\n\n"
            "Wraps gdal2tiles.py with AEGIS-standard defaults.\n"
            "Output includes tilemapresource.xml for self-describing tilesets."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Profiles:\n"
            "  raster   — for custom-projection rasters (lunar south pole, etc.)\n"
            "             Bounds in projection units (meters). Use with tile_grid_version=2.\n"
            "  mercator — for EPSG:3857 Web Mercator rasters (Earth missions)\n"
            "             Bounds in degrees. Standard web map tiles.\n\n"
            "Examples (from GIS_data_conversion_pipeline/):\n"
            "  pixi run python esri-to-aegis-lunar-southpole/common/raster_to_tiles.py input.tif output_tiles/ --profile raster\n"
            "  pixi run python esri-to-aegis-lunar-southpole/common/raster_to_tiles.py input.tif output_tiles/ --profile mercator --zoom 0-17\n"
        ),
    )
    parser.add_argument("input", type=Path, help="Input GeoTIFF")
    parser.add_argument("output_dir", type=Path, help="Output tile directory")
    parser.add_argument(
        "--profile",
        default="raster",
        choices=["raster", "mercator", "geodetic"],
        help="Tile profile (default: raster)",
    )
    parser.add_argument(
        "--zoom",
        default=None,
        help="Zoom range, e.g. '0-13' (default: auto-detect from raster resolution)",
    )
    parser.add_argument(
        "--resampling",
        default="average",
        choices=["average", "near", "bilinear", "cubic", "cubicspline", "lanczos"],
        help="Resampling method for overviews (default: average)",
    )
    parser.add_argument(
        "--tile-size",
        type=int,
        default=256,
        help="Tile size in pixels (default: 256)",
    )
    parser.add_argument(
        "--processes",
        type=int,
        default=None,
        help="Number of parallel processes (default: single process)",
    )

    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("GeoTIFF → TMS Tile Pyramid")
    print("=" * 60)
    print(f"  Input:  {args.input.resolve()}")
    print(f"  Output: {args.output_dir.resolve()}")
    print()

    run_gdal2tiles(
        args.input,
        args.output_dir,
        profile=args.profile,
        zoom=args.zoom,
        resampling=args.resampling,
        tile_size=args.tile_size,
        processes=args.processes,
    )

    print("Set tile_grid_version = 2 in the mission database for this tileset.")
    print("See TILESET-MIGRATION-STRATEGY.md for details.")


if __name__ == "__main__":
    main()
