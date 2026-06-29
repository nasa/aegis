#!/usr/bin/env python3
"""Tile a raster for a **Mercator / global** layout (Earth Web-Mercator, or a Moon global map).

This is the non-polar counterpart to ``esri-to-aegis-lunar-southpole`` (which tiles onto the
lunar south-pole *cap grid*).  Use this folder for Earth missions or for global/non-polar
Moon datasets.  South-pole products should still go through the cap-grid pipeline.

Ported from the ``_tile_earth`` path of ``lunar_utils/aegis/tiling.py``:

* ``--body earth`` (default): reproject to **EPSG:3857** (``gdal.Warp``) → tile with the
  ``gdal2tiles`` **mercator** profile (standard Web-Mercator XYZ/TMS tiles).
* ``--body moon``: tile with the **geodetic** (equirectangular lon/lat) profile — gdal2tiles'
  built-in ``mercator`` profile assumes the Earth ellipsoid, so a true Moon Web-Mercator is
  not available here; geodetic is the portable global choice for the Moon.

Tiling reuses the existing wrapper
``esri-to-aegis-lunar-southpole/common/raster_to_tiles.py`` (which wraps ``gdal2tiles`` with
AEGIS defaults) via subprocess, so there are no vendored tiling scripts.  ``gdal2tiles`` is
provided by pixi's conda-forge GDAL — no system GDAL install required.

Like the legacy code, if ``gdal2tiles`` rejects non-8-bit input, the raster is rescaled to
Byte and tiling is retried.

Usage
-----
::

    cd data_conversion_scripts
    pixi run python mercator/tile_mercator.py imagery.tif out_tiles --body earth
    pixi run python mercator/tile_mercator.py moon_global.tif out_tiles --body moon --zoom 0-7
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from osgeo import gdal

gdal.UseExceptions()

RASTER_TO_TILES = (
    Path(__file__).resolve().parent.parent
    / "esri-to-aegis-lunar-southpole"
    / "common"
    / "raster_to_tiles.py"
)
PYTHON = sys.executable

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def _run_tiler(src: Path, out_dir: Path, profile: str, zoom: str | None, resampling: str) -> int:
    cmd = [PYTHON, str(RASTER_TO_TILES), str(src), str(out_dir), "--profile", profile,
           "--resampling", resampling]
    if zoom:
        cmd += ["--zoom", zoom]
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    print(f"\n$ {' '.join(cmd)}")
    return subprocess.run(cmd, env=env).returncode


def _to_byte(src: Path, scratch: Path) -> Path:
    """Rescale a raster to 8-bit (Byte) — gdal2tiles requires 8-bit input."""
    out = scratch / f"{src.stem}_8bit.tif"
    gdal.Translate(destName=str(out), srcDS=str(src), options=["-ot", "Byte", "-scale"])
    return out


def tile_mercator(
    input_path: Path, output_dir: Path, body: str, zoom: str | None, resampling: str
) -> None:
    profile = "mercator" if body == "earth" else "geodetic"

    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp)

        src = input_path
        if body == "earth":
            warped = scratch / f"{input_path.stem}_3857.tif"
            print(f"Reprojecting to EPSG:3857 → {warped}")
            gdal.Warp(str(warped), str(input_path), dstSRS="EPSG:3857")
            src = warped

        rc = _run_tiler(src, output_dir, profile, zoom, resampling)
        if rc != 0:
            # Legacy fallback: gdal2tiles often fails with "convert to 8-bit". Retry as Byte.
            print("\nTiling failed — rescaling to 8-bit and retrying…")
            src8 = _to_byte(src, scratch)
            rc = _run_tiler(src8, output_dir, profile, zoom, resampling)
            if rc != 0:
                print(f"ERROR: gdal2tiles failed (exit {rc}) even after 8-bit rescale.", file=sys.stderr)
                sys.exit(rc)


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("input", type=Path, help="Input raster GeoTIFF.")
    p.add_argument("output_dir", type=Path, help="Output tile directory.")
    p.add_argument(
        "--body",
        default="earth",
        choices=["earth", "moon"],
        help="earth → EPSG:3857 mercator tiles; moon → geodetic (lon/lat) tiles. Default: earth.",
    )
    p.add_argument("--zoom", default=None, help="Zoom range e.g. '0-13' (default: auto).")
    p.add_argument(
        "--resampling",
        default="average",
        choices=["average", "near", "bilinear", "cubic", "cubicspline", "lanczos"],
        help="Overview resampling (default: average).",
    )
    return p


def main() -> None:
    args = make_parser().parse_args()
    in_path: Path = args.input.resolve()
    if not in_path.exists():
        print(f"ERROR: input not found: {in_path}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print(f"Mercator/global tiling — body={args.body}")
    print("=" * 60)
    tile_mercator(in_path, args.output_dir.resolve(), args.body, args.zoom, args.resampling)
    print("\nDone.")


if __name__ == "__main__":
    main()
