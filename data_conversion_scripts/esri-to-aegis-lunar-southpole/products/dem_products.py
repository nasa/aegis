#!/usr/bin/env python3
"""Derive standardized AEGIS raster products from a DEM (slope, hillshade, aspect, TRI).

This lets us **control our own standardized products** straight from a DEM input rather
than depending on whatever the GIS team happens to deliver.  Each product is produced as
an 8-bit raster ready for ``common/tile_to_cap_grid.py``:

    slope      → degrees, colorized via products/color_ramps/slope.txt      (RGBA)
    hillshade  → shaded relief, grayscale, no colour ramp                   (single band)
    aspect     → slope-facing azimuth, colorized via aspect.txt             (RGBA)
    tri        → Terrain Ruggedness Index (m), colorized via tri.txt        (RGBA)

Colour standards live in ``products/color_ramps/`` and are the single source of truth for
AEGIS colour treatment (see ``products/README.md``).  Notably ``slope.txt`` encodes the
**same** standard as the GIS-team ``AMPES_Slope 1.lyrx`` used by ``slope/colorize_slope.py``
(ColorBrewer RdYlBu-10 reversed + dark-purple >20° cap), so DEM-derived slope and
GIS-delivered slope render identically.

**TRI is resolution-dependent** — the default ``tri.txt`` is the legacy 7-class ramp; for a
specific DEM resolution prefer a matching ramp from ``products/color_ramps/ARCHIVE/``
(``TRIColors_{1m,5m,10m}_DEM.txt``) via ``--tri-ramp``.

Ported from ``lunar_utils/aegis/products.py``.  Uses the GDAL Python bindings provided by
pixi/conda-forge — **no system GDAL install required** (the whole point of the pixi env).

Usage
-----
::

    cd data_conversion_scripts
    pixi run python esri-to-aegis-lunar-southpole/products/dem_products.py \\
        --dem /path/to/dem.tif --out /path/to/products \\
        --products slope hillshade aspect tri

Then tile each product, e.g.::

    pixi run python esri-to-aegis-lunar-southpole/common/tile_to_cap_grid.py \\
        /path/to/products/slope.tif /out/Layers/slope
"""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from osgeo import gdal

gdal.UseExceptions()  # surface GDAL errors as Python exceptions instead of silent None

# Force UTF-8 stdout/stderr — avoids UnicodeEncodeError on default cp1252 terminals.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent
RAMPS = ROOT / "color_ramps"

# Default colour ramp per product. Hillshade is grayscale → no ramp.
DEFAULT_RAMPS: dict[str, Path | None] = {
    "slope": RAMPS / "slope.txt",
    "aspect": RAMPS / "aspect.txt",
    "tri": RAMPS / "tri.txt",
    "hillshade": None,
}

# gdal.DEMProcessing's processing keyword per product (TRI must be upper-case "TRI").
GDAL_MODE = {
    "slope": "slope",
    "aspect": "aspect",
    "tri": "TRI",
    "hillshade": "hillshade",
}

ALL_PRODUCTS = ["slope", "hillshade", "aspect", "tri"]


def _colorize(processed: str, ramp: Path, out_path: Path) -> None:
    """gdaldem color-relief a single-band raster → 8-bit RGBA GeoTIFF (nodata transparent)."""
    gdal.DEMProcessing(
        destName=str(out_path),
        srcDS=processed,
        processing="color-relief",
        colorFilename=str(ramp),
        addAlpha=True,  # emit an alpha band: valid=255, nodata=0 (honoured by tile_to_cap_grid)
        format="GTiff",
        creationOptions=["TILED=YES", "COMPRESS=DEFLATE"],
        computeEdges=True,
    )


def make_product(dem: Path, product: str, ramp: Path | None, out_dir: Path) -> Path:
    """Produce one DEM-derived product. Returns the output GeoTIFF path."""
    mode = GDAL_MODE[product]
    out_path = out_dir / f"{product}.tif"
    print(f"\n--- {product} ({mode}) ---")
    print(f"  dem:  {dem}")
    if ramp:
        print(f"  ramp: {ramp}")

    if product == "hillshade":
        # Grayscale shaded relief — written directly, no colour ramp.
        gdal.DEMProcessing(
            destName=str(out_path),
            srcDS=str(dem),
            processing="hillshade",
            format="GTiff",
            creationOptions=["TILED=YES", "COMPRESS=DEFLATE"],
        )
        print(f"  wrote {out_path}")
        return out_path

    # slope / aspect / tri: process to a temp float raster, then colorize → RGBA.
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        processed = tmp.name
    try:
        gdal.DEMProcessing(
            destName=processed,
            srcDS=str(dem),
            processing=mode,
            computeEdges=True,
        )
        _colorize(processed, ramp, out_path)  # type: ignore[arg-type]
    finally:
        Path(processed).unlink(missing_ok=True)  # NamedTemporaryFile(delete=False) → clean up

    print(f"  wrote {out_path}")
    return out_path


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--dem", type=Path, required=True, help="Input DEM GeoTIFF.")
    p.add_argument("--out", type=Path, required=True, help="Output directory for the products.")
    p.add_argument(
        "--products",
        nargs="+",
        default=ALL_PRODUCTS,
        choices=ALL_PRODUCTS,
        help=f"Which products to generate (default: {ALL_PRODUCTS}).",
    )
    p.add_argument("--slope-ramp", type=Path, default=None, help="Override slope colour ramp.")
    p.add_argument("--aspect-ramp", type=Path, default=None, help="Override aspect colour ramp.")
    p.add_argument(
        "--tri-ramp",
        type=Path,
        default=None,
        help="Override TRI colour ramp (prefer a resolution-matched ramp from color_ramps/ARCHIVE/).",
    )
    return p


def main() -> None:
    args = make_parser().parse_args()

    dem: Path = args.dem.resolve()
    if not dem.exists():
        print(f"ERROR: DEM not found: {dem}", file=sys.stderr)
        sys.exit(1)

    out_dir: Path = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    overrides = {"slope": args.slope_ramp, "aspect": args.aspect_ramp, "tri": args.tri_ramp}

    print("=" * 64)
    print("DEM → standardized AEGIS products")
    print("=" * 64)

    for product in args.products:
        ramp = overrides.get(product) or DEFAULT_RAMPS[product]
        if ramp is not None:
            ramp = Path(ramp).resolve()
            if not ramp.exists():
                print(f"ERROR: colour ramp not found for {product}: {ramp}", file=sys.stderr)
                sys.exit(1)
        make_product(dem, product, ramp, out_dir)

    print(f"\nDone. Products in {out_dir}")


if __name__ == "__main__":
    main()
