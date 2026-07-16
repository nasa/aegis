"""Convert a raw GeoTIFF to a Cloud Optimised GeoTIFF (COG).

A COG has internal tiling, overviews, and compression — it can be served
directly to OpenLayers via ol/source/GeoTIFF using HTTP Range requests.
No tile server or intermediate format needed.

Uses GDAL's native COG driver (via rasterio.shutil.copy) which handles
tiling + overviews + compression in a single optimised pass with
multi-threaded compression across all CPU cores.

Compression options (--compress):
    zstd    — fastest lossless, excellent ratio (default)
    deflate — lossless, universally supported
    lzw     — lossless, fast decompression
    jpeg    — lossy, ~10-20x compression, ideal for visual imagery
    lerc    — lossy with controlled error bounds

Usage:
    cd data_conversion_scripts

    # Default (ZSTD lossless):
    pixi run python esri-to-aegis-lunar-southpole/common/geotiff_to_cog.py <input.tif>

    # JPEG lossy (smallest file):
    pixi run python esri-to-aegis-lunar-southpole/common/geotiff_to_cog.py <input.tif> --compress jpeg

    # Custom output path:
    pixi run python esri-to-aegis-lunar-southpole/common/geotiff_to_cog.py <input.tif> -o <output_cog.tif>
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
from pathlib import Path

import rasterio
import rasterio.shutil

# Force UTF-8 stdout/stderr — avoids UnicodeEncodeError on default cp1252 terminals.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def build_cog(
    src_path: Path,
    dst_path: Path,
    compress: str = "zstd",
    jpeg_quality: int = 85,
    blocksize: int = 512,
) -> Path:
    """
    Convert an arbitrary GeoTIFF into a COG using GDAL's native COG driver.

    Uses rasterio.shutil.copy() which delegates to GDAL's optimised single-pass
    COG builder — handles internal tiling, overviews, and compression in one go,
    with multi-threaded compression across all available CPU cores.
    """
    print("-" * 60)
    print("Building Cloud Optimised GeoTIFF")
    print("-" * 60)

    src_size_gb = src_path.stat().st_size / (1024**3)

    with rasterio.open(src_path) as src:
        print(f"  Source:      {src_path}  ({src_size_gb:.2f} GB)")
        print(f"  Destination: {dst_path}")
        print(
            f"  Size:        {src.width:,} x {src.height:,}  "
            f"({src.count} band, {src.dtypes[0]})"
        )
        print(f"  Compression: {compress.upper()}", end="")
        if compress == "jpeg":
            print(f"  (quality={jpeg_quality})", end="")
        print()
        print(f"  Block size:  {blocksize} x {blocksize}")
        print(f"  Threads:     all CPUs ({os.cpu_count()})")
        print()

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        t0 = time.time()

        copy_kwargs: dict = dict(
            driver="COG",
            compress=compress,
            blocksize=blocksize,
            num_threads="all_cpus",
            overview_resampling="average",
            BIGTIFF="YES",
        )

        if compress == "jpeg":
            copy_kwargs["quality"] = jpeg_quality

        # Horizontal differencing predictor improves lossless compression
        if compress in ("deflate", "lzw", "zstd"):
            copy_kwargs["predictor"] = "yes"

        print("  Writing COG (single-pass, multi-threaded) ...", flush=True)

        # rasterio.shutil.copy has no progress callback, so report the growing output
        # file size every 15 s from a monitor thread. Size is a proxy (compression means
        # it won't match the source), but it shows the write is alive and how fast.
        done = threading.Event()

        def _monitor() -> None:
            while not done.wait(15):
                try:
                    written_gb = dst_path.stat().st_size / (1024**3)
                except OSError:
                    continue
                print(
                    f"    ... {written_gb:.2f} GB written  ({time.time() - t0:.0f}s elapsed)",
                    flush=True,
                )

        mon = threading.Thread(target=_monitor, daemon=True)
        mon.start()
        try:
            rasterio.shutil.copy(src, str(dst_path), **copy_kwargs)
        finally:
            done.set()
            mon.join(timeout=1)

    elapsed = time.time() - t0
    cog_size_gb = dst_path.stat().st_size / (1024**3)
    ratio = src_size_gb / cog_size_gb if cog_size_gb > 0 else 0
    print(f"\n  Done.")
    print(f"  Source:  {src_size_gb:.2f} GB")
    print(f"  COG:     {cog_size_gb:.2f} GB  ({ratio:.1f}x compression)")
    print(f"  Elapsed: {elapsed:.0f}s")
    print()

    return dst_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Convert a raw GeoTIFF to a Cloud Optimised GeoTIFF (COG).\n\n"
            "The COG can be served directly to OpenLayers via\n"
            "ol/source/GeoTIFF using HTTP Range requests.\n\n"
            "Compression options (--compress):\n"
            "  zstd    — fastest lossless, excellent ratio (default)\n"
            "  deflate — lossless, universally supported\n"
            "  lzw     — lossless, fast decompression\n"
            "  jpeg    — lossy, ~10-20x compression, great for imagery\n"
            "  lerc    — lossy with controlled error bounds"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples (from data_conversion_scripts/):\n"
            "  # ZSTD (default, lossless):\n"
            "  pixi run python esri-to-aegis-lunar-southpole/common/geotiff_to_cog.py input.tif\n\n"
            "  # JPEG (lossy, smallest file):\n"
            "  pixi run python esri-to-aegis-lunar-southpole/common/geotiff_to_cog.py input.tif --compress jpeg\n\n"
            "  # Custom output path:\n"
            "  pixi run python esri-to-aegis-lunar-southpole/common/geotiff_to_cog.py input.tif -o my_output_cog.tif\n"
        ),
    )
    parser.add_argument("input", type=Path, help="Input GeoTIFF")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output COG path (default: <input>_cog.tif)",
    )
    parser.add_argument(
        "--compress",
        default="zstd",
        choices=["zstd", "deflate", "lzw", "jpeg", "lerc"],
        help="Compression algorithm (default: zstd)",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=85,
        help="JPEG quality 1-100 when --compress=jpeg (default: 85)",
    )
    parser.add_argument(
        "--blocksize",
        type=int,
        default=512,
        help="Internal tile size in pixels (default: 512)",
    )

    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    output = args.output or args.input.with_name(args.input.stem + "_cog.tif")

    print("=" * 60)
    print("GeoTIFF → COG Converter")
    print("=" * 60)
    print()

    build_cog(
        args.input,
        output,
        compress=args.compress,
        jpeg_quality=args.jpeg_quality,
        blocksize=args.blocksize,
    )

    print("Serve the COG via any static host with Range request support.")
    print("OpenLayers: use ol/source/GeoTIFF + ol/layer/WebGLTile")


if __name__ == "__main__":
    main()
