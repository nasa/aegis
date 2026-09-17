#!/usr/bin/env python3
"""Derive standardized AEGIS raster products from a DEM.

This lets us **control our own standardized products** straight from a DEM input rather
than depending on whatever the GIS team happens to deliver.  Each product is produced as
an 8-bit raster ready for ``common/tile_to_cap_grid.py``:

    slope      → degrees, colorized via default_color_ramps/slope.txt       (RGBA)
    slope_colorblind → degrees, colorized via slope_colorblind.txt           (RGBA)
    hillshade  → shaded relief, grayscale, no colour ramp                   (single band)
    aspect     → slope-facing azimuth, colorized via aspect.txt             (RGBA)
    tri        → Terrain Ruggedness Index (m), colorized via tri.txt        (RGBA)

Built-in ramps live in ``products/default_color_ramps/`` (the fallbacks). The default slope
palette is defined by ``default_color_ramps/slope.txt``. When the GIS team delivers product
symbology as an ArcGIS ``.lyrx``, pass it with ``--slope-lyrx`` / ``--aspect-lyrx`` /
``--tri-lyrx`` and it is used **instead of** the default ramp (converted on the fly by
``lyrx_to_ramp.py``). Precedence per product: ``--*-lyrx`` > ``--*-ramp`` > default.

**TRI is resolution-dependent** — the default ``tri.txt`` is the legacy 7-class ramp; for a
specific DEM resolution prefer a matching ramp from ``products/default_color_ramps/ARCHIVE/``
(``TRIColors_{1m,5m,10m}_DEM.txt``) via ``--tri-ramp``.

Ported from ``lunar_utils/aegis/products.py``.  Uses the GDAL Python bindings provided by
pixi/conda-forge — **no system GDAL install required** (the whole point of the pixi env).

Usage
-----
::

    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/products/dem_products.py \\
        --dem /path/to/dem.tif --out /path/to/products \\
        --products slope hillshade aspect tri

Then tile each product, e.g.::

    pixi run python esri-to-aegis-lunar-southpole/common/tile_to_cap_grid.py \\
        /path/to/products/slope.tif /out/Layers/slope
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
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
RAMPS = ROOT / "default_color_ramps"

# Default colour ramp per product. Hillshade is grayscale → no ramp.
DEFAULT_RAMPS: dict[str, Path | None] = {
    "slope": RAMPS / "slope.txt",
    "slope_colorblind": RAMPS / "slope_colorblind.txt",
    "aspect": RAMPS / "aspect.txt",
    "tri": RAMPS / "tri.txt",
    "hillshade": None,
}

# gdal.DEMProcessing's processing keyword per product (TRI must be upper-case "TRI").
GDAL_MODE = {
    "slope": "slope",
    "slope_colorblind": "slope",
    "aspect": "aspect",
    "tri": "TRI",
    "hillshade": "hillshade",
}

ALL_PRODUCTS = ["slope", "slope_colorblind", "hillshade", "aspect", "tri"]


def _progress(label: str):
    """A gdal progress callback printing a line every 10% (works when stdout is a pipe)."""
    state = {"next": 0.1, "t0": time.monotonic()}

    def cb(complete: float, _msg, _data) -> int:
        if complete >= state["next"] or complete >= 1.0:
            elapsed = time.monotonic() - state["t0"]
            print(f"    [{label}] {complete * 100:3.0f}%  ({elapsed:.0f}s)", flush=True)
            state["next"] = complete + 0.1
        return 1  # non-zero = keep going

    return cb


def _colorize(
    processed: str, ramp: Path, out_path: Path, label: str = "colorize"
) -> None:
    """gdaldem color-relief a single-band raster → 8-bit RGBA GeoTIFF (nodata transparent)."""
    gdal.DEMProcessing(
        destName=str(out_path),
        srcDS=processed,
        processing="color-relief",
        colorFilename=str(ramp),
        addAlpha=True,  # emit an alpha band: valid=255, nodata=0 (honoured by tile_to_cap_grid)
        format="GTiff",
        creationOptions=["TILED=YES", "COMPRESS=DEFLATE", "BIGTIFF=IF_SAFER"],
        computeEdges=True,
        callback=_progress(label),
    )


def make_product(dem: Path, product: str, ramp: Path | None, out_dir: Path) -> Path:
    """Produce one DEM-derived product. Returns the output GeoTIFF path."""
    mode = GDAL_MODE[product]
    out_path = out_dir / f"{product}.tif"
    print(f"\n--- {product} ({mode}) ---", flush=True)
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
            creationOptions=["TILED=YES", "COMPRESS=DEFLATE", "BIGTIFF=IF_SAFER"],
            callback=_progress("hillshade"),
        )
        print(f"  wrote {out_path}")
        return out_path

    # slope / slope_colorblind / aspect / tri: process to an intermediate float raster,
    # then colorize → RGBA.
    # The intermediate lives next to the outputs (NOT %TEMP%: a big DEM would drop a
    # multi-GB uncompressed float there, often on a small system drive) and is compressed.
    processed = out_dir / f"_{product}_float.tif"
    try:
        gdal.DEMProcessing(
            destName=str(processed),
            srcDS=str(dem),
            processing=mode,
            computeEdges=True,
            format="GTiff",
            creationOptions=["TILED=YES", "COMPRESS=DEFLATE", "BIGTIFF=IF_SAFER"],
            callback=_progress(mode),
        )
        _colorize(str(processed), ramp, out_path, f"colorize {product}")  # type: ignore[arg-type]
    finally:
        processed.unlink(missing_ok=True)

    print(f"  wrote {out_path}")
    return out_path


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--dem", type=Path, required=True, help="Input DEM GeoTIFF.")
    p.add_argument(
        "--out", type=Path, required=True, help="Output directory for the products."
    )
    p.add_argument(
        "--products",
        nargs="+",
        default=ALL_PRODUCTS,
        choices=ALL_PRODUCTS,
        help=f"Which products to generate (default: {ALL_PRODUCTS}).",
    )
    p.add_argument(
        "--slope-ramp", type=Path, default=None, help="Override slope colour ramp."
    )
    p.add_argument(
        "--slope-colorblind-ramp",
        type=Path,
        default=None,
        help="Override the colorblind slope colour ramp.",
    )
    p.add_argument(
        "--aspect-ramp", type=Path, default=None, help="Override aspect colour ramp."
    )
    p.add_argument(
        "--tri-ramp",
        type=Path,
        default=None,
        help="Override TRI colour ramp (prefer a resolution-matched ramp from default_color_ramps/ARCHIVE/).",
    )
    # GIS-delivered ArcGIS symbology per product. Converted to a gdaldem ramp and used
    # INSTEAD OF the default/--*-ramp (precedence: --*-lyrx > --*-ramp > default).
    p.add_argument(
        "--slope-lyrx",
        type=Path,
        default=None,
        help="ArcGIS .lyrx slope symbology to use instead of the slope ramp.",
    )
    p.add_argument(
        "--aspect-lyrx",
        type=Path,
        default=None,
        help="ArcGIS .lyrx aspect symbology to use instead of the aspect ramp.",
    )
    p.add_argument(
        "--tri-lyrx",
        type=Path,
        default=None,
        help="ArcGIS .lyrx TRI symbology to use instead of the TRI ramp.",
    )
    return p


def _resolve_ramp(
    product: str, lyrx: Path | None, override: Path | None, out_dir: Path
) -> Path | None:
    """Pick a product's colour ramp: provided .lyrx (converted) > --*-ramp > default."""
    if lyrx is not None:
        lyrx = lyrx.resolve()
        if not lyrx.exists():
            print(f"ERROR: lyrx not found for {product}: {lyrx}", file=sys.stderr)
            sys.exit(1)
        from lyrx_to_ramp import lyrx_to_ramp  # same-dir module

        ramp = lyrx_to_ramp(lyrx, out_dir / f"{product}_from_lyrx.txt")
        print(f"  [{product}] using GIS symbology {lyrx.name} → {ramp.name}")
        return ramp
    ramp = override or DEFAULT_RAMPS[product]
    if ramp is not None:
        ramp = Path(ramp).resolve()
        if not ramp.exists():
            print(
                f"ERROR: colour ramp not found for {product}: {ramp}", file=sys.stderr
            )
            sys.exit(1)
    return ramp


def main() -> None:
    args = make_parser().parse_args()

    dem: Path = args.dem.resolve()
    if not dem.exists():
        print(f"ERROR: DEM not found: {dem}", file=sys.stderr)
        sys.exit(1)

    out_dir: Path = args.out.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    overrides = {
        "slope": args.slope_ramp,
        "slope_colorblind": args.slope_colorblind_ramp,
        "aspect": args.aspect_ramp,
        "tri": args.tri_ramp,
    }
    lyrxes = {
        "slope": args.slope_lyrx,
        "aspect": args.aspect_lyrx,
        "tri": args.tri_lyrx,
    }

    print("=" * 64)
    print("DEM → standardized AEGIS products")
    print("=" * 64)

    # Resolve every product's colour ramp up front (sequential + cheap; a .lyrx conversion
    # writes a ramp file, so it must finish before the products fan out).
    ramps = {
        product: (
            None
            if product == "hillshade"
            else _resolve_ramp(
                product, lyrxes.get(product), overrides.get(product), out_dir
            )
        )
        for product in args.products
    }

    # Each gdal.DEMProcessing call is single-threaded, and the products are independent (each
    # re-reads the DEM and computes on its own). So the CPU win is running the products in
    # PARALLEL PROCESSES, one per core, instead of one-after-another. Falls back to serial for
    # a single product (no pool overhead).
    workers = min(len(args.products), os.cpu_count() or 1)
    if workers <= 1:
        for product in args.products:
            make_product(dem, product, ramps[product], out_dir)
    else:
        print(
            f"\n  deriving {len(args.products)} products in parallel ({workers} workers)"
        )
        with ProcessPoolExecutor(max_workers=workers) as ex:
            futures = {
                ex.submit(make_product, dem, product, ramps[product], out_dir): product
                for product in args.products
            }
            for fut in as_completed(futures):
                fut.result()  # re-raise any worker exception

    print(f"\nDone. Products in {out_dir}")


if __name__ == "__main__":
    main()
