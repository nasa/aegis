"""Percentile-stretch a float radiance raster to single-band 8-bit grayscale.

The LROC NAC SfS ortho mosaic is a single float32 band of orthorectified
radiance with values in a *tiny* range (~0.0–0.07). AEGIS cannot display that
directly — it must be contrast-stretched to an 8-bit grayscale image first.

This script:
  1. Samples the input (decimated reads, never the whole multi-GB mosaic) and
     computes low/high cut values at the requested percentiles, ignoring nodata.
  2. Linearly rescales ``[low, high] → [1, 255]`` block-by-block.
  3. Reserves output value ``0`` as nodata so the fill area is transparent in
     AEGIS / gdal2tiles.
  4. Writes a single-band tiled uint8 GeoTIFF, preserving CRS + transform.

Single band is intentional — the NAC imagery is monochrome, and gdal2tiles /
Leaflet / OpenLayers render single-band PNG tiles fine, so there is no reason
to triple the data into RGB.

Because it uses rasterio (which bundles its own GDAL), this script runs fine
under either ``uv run`` or ``pixi run``; it needs no GDAL CLI on PATH. It can
read a ``.vrt`` mosaic produced by ``mosaic_rasters.py`` directly, so no
materialised intermediate is required.

Usage:
    cd data_conversion_scripts

    # Read the VRT mosaic, write an 8-bit grayscale GeoTIFF, 2–98% stretch
    uv run python stretch_to_8bit.py \\
        ../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt \\
        ../../aegis_static/processed/A03MP026/nac_sfs_ortho_8bit.tif \\
        --pct-low 2 --pct-high 98 --nodata -3.4e38

    # Use explicit cut values instead of percentiles
    uv run python stretch_to_8bit.py in.vrt out.tif --min 0.0 --max 0.07
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

import numpy as np
import rasterio

# Force UTF-8 stdout/stderr so Unicode in help/progress text doesn't crash on a
# default cp1252 Windows console (no need to set PYTHONUTF8=1 first).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def make_parser(**kwargs) -> argparse.ArgumentParser:
    """ArgumentParser that accepts space-separated negative numbers in scientific
    notation (e.g. ``--nodata -3.4e38``).

    argparse's built-in negative-number detection only matches plain integers /
    decimals (``-5``, ``-3.4``), so a token like ``-3.4e38`` is mistaken for an
    option flag and you get "expected one argument". Widening the matcher to
    include exponent/decimal forms lets the natural ``--nodata -3.4e38`` work
    (the ``--nodata=-3.4e38`` form always worked).
    """
    parser = argparse.ArgumentParser(**kwargs)
    parser._negative_number_matcher = re.compile(  # type: ignore[attr-defined]
        r"^-\d+$|^-\d*\.?\d+(?:[eE][-+]?\d+)?$"
    )
    return parser


def compute_percentile_cuts(
    src: rasterio.DatasetReader,
    band: int,
    pct_low: float,
    pct_high: float,
    nodata: float | None,
    max_samples: int = 5_000_000,
) -> tuple[float, float]:
    """Compute low/high cut values from a decimated read of the band.

    Reads the band at a decimation factor chosen so total sampled pixels stay
    under ``max_samples`` — fast and memory-light even on a multi-GB mosaic —
    then takes percentiles over the finite, non-nodata values.
    """
    full = src.width * src.height
    # Decimation factor so that (width/f) * (height/f) <= max_samples.
    factor = max(1, int(np.ceil(np.sqrt(full / max_samples))))
    out_w = max(1, src.width // factor)
    out_h = max(1, src.height // factor)

    print(
        f"  Sampling band {band}: {src.width:,} x {src.height:,} "
        f"→ decimated {out_w:,} x {out_h:,} (factor {factor})"
    )

    data = src.read(
        band,
        out_shape=(out_h, out_w),
        resampling=rasterio.enums.Resampling.average,
    ).astype("float64", copy=False)

    mask = np.isfinite(data)
    if nodata is not None:
        mask &= data != nodata
    # Also drop the source's declared nodata if present.
    src_nodata = src.nodatavals[band - 1]
    if src_nodata is not None and np.isfinite(src_nodata):
        mask &= data != src_nodata

    valid = data[mask]
    if valid.size == 0:
        print(
            "ERROR: no valid (non-nodata, finite) pixels found to sample.",
            file=sys.stderr,
        )
        sys.exit(1)

    low = float(np.percentile(valid, pct_low))
    high = float(np.percentile(valid, pct_high))
    if high <= low:
        print(
            f"ERROR: computed high cut ({high}) <= low cut ({low}); "
            "check --pct-low/--pct-high or pass explicit --min/--max.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(
        f"  Valid sample pixels: {valid.size:,}  "
        f"(min={valid.min():.5g}, max={valid.max():.5g})"
    )
    print(f"  Cut values: {pct_low}% = {low:.6g}   {pct_high}% = {high:.6g}")
    return low, high


def stretch(
    src_path: Path,
    dst_path: Path,
    band: int,
    low: float,
    high: float,
    nodata: float | None,
    blocksize: int,
    compress: str,
) -> None:
    """Rescale [low, high] → [1, 255] block-by-block into a uint8 GeoTIFF (0 = nodata)."""
    scale = 254.0 / (high - low)

    with rasterio.open(src_path) as src:
        profile = src.profile.copy()
        profile.update(
            driver="GTiff",
            dtype="uint8",
            count=1,
            nodata=0,
            tiled=True,
            blockxsize=blocksize,
            blockysize=blocksize,
            compress=compress,
            BIGTIFF="IF_SAFER",
            NUM_THREADS="ALL_CPUS",
        )
        # Drop any photometric/extra band tags that don't apply to 1-band uint8.
        profile.pop("photometric", None)

        src_nodata = src.nodatavals[band - 1]

        dst_path.parent.mkdir(parents=True, exist_ok=True)
        print("-" * 60)
        print("Stretching → 8-bit grayscale")
        print("-" * 60)
        print(f"  Source:      {src_path}")
        print(f"  Destination: {dst_path}")
        print(f"  Map:         [{low:.6g}, {high:.6g}] → [1, 255]   (0 = nodata)")
        print(f"  Block size:  {blocksize} x {blocksize}")
        print()

        t0 = time.time()
        n_blocks = 0
        with rasterio.open(dst_path, "w", **profile) as dst:
            # Iterate the output's block windows for cache-friendly I/O.
            for _, window in dst.block_windows(1):
                arr = src.read(band, window=window).astype("float64", copy=False)

                valid = np.isfinite(arr)
                if nodata is not None:
                    valid &= arr != nodata
                if src_nodata is not None and np.isfinite(src_nodata):
                    valid &= arr != src_nodata

                scaled = (arr - low) * scale + 1.0
                np.clip(scaled, 1.0, 255.0, out=scaled)
                out = scaled.astype("uint8")
                out[~valid] = 0  # transparent nodata

                dst.write(out, 1, window=window)
                n_blocks += 1

        elapsed = time.time() - t0
        size_mb = dst_path.stat().st_size / (1024**2)
        print(f"  Wrote {n_blocks:,} blocks in {elapsed:.0f}s → {size_mb:.1f} MB")
        print()


def main() -> None:
    parser = make_parser(
        description=(
            "Percentile-stretch a float radiance raster to single-band 8-bit\n"
            "grayscale. Output value 0 is reserved as transparent nodata.\n"
            "Reads .vrt mosaics directly; needs no GDAL CLI (rasterio bundles GDAL)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  uv run python stretch_to_8bit.py in.vrt out.tif \\\n"
            "      --pct-low 2 --pct-high 98 --nodata -3.4e38\n\n"
            "  uv run python stretch_to_8bit.py in.vrt out.tif --min 0.0 --max 0.07\n"
        ),
    )
    parser.add_argument("input", type=Path, help="Input float raster or .vrt mosaic")
    parser.add_argument("output", type=Path, help="Output 8-bit grayscale GeoTIFF")
    parser.add_argument(
        "--band", type=int, default=1, help="Source band to stretch (default: 1)"
    )
    parser.add_argument(
        "--pct-low",
        type=float,
        default=2.0,
        help="Low percentile cut (default: 2.0). Ignored if --min is given.",
    )
    parser.add_argument(
        "--pct-high",
        type=float,
        default=98.0,
        help="High percentile cut (default: 98.0). Ignored if --max is given.",
    )
    parser.add_argument(
        "--min",
        type=float,
        default=None,
        help="Explicit low cut value (overrides --pct-low)",
    )
    parser.add_argument(
        "--max",
        type=float,
        default=None,
        help="Explicit high cut value (overrides --pct-high)",
    )
    parser.add_argument(
        "--nodata",
        type=float,
        default=None,
        help="Extra input nodata value to ignore (e.g. -3.4e38)",
    )
    parser.add_argument(
        "--blocksize",
        type=int,
        default=512,
        help="Internal tile size of the output (default: 512)",
    )
    parser.add_argument(
        "--compress",
        default="deflate",
        choices=["deflate", "lzw", "zstd", "none"],
        help="Output compression (default: deflate)",
    )
    parser.add_argument(
        "--max-samples",
        type=int,
        default=5_000_000,
        help="Max pixels to sample for percentile estimation (default: 5,000,000)",
    )

    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("Stretch Radiance → 8-bit Grayscale")
    print("=" * 60)
    print(f"  Input:  {args.input.resolve()}")
    print(f"  Output: {args.output.resolve()}")
    print()

    with rasterio.open(args.input) as src:
        if args.min is not None and args.max is not None:
            low, high = args.min, args.max
            if high <= low:
                print(
                    f"ERROR: --max ({high}) must exceed --min ({low}).", file=sys.stderr
                )
                sys.exit(1)
            print(f"  Using explicit cut values: [{low}, {high}]")
        else:
            low, high = compute_percentile_cuts(
                src,
                args.band,
                args.pct_low,
                args.pct_high,
                args.nodata,
                max_samples=args.max_samples,
            )
            # Allow overriding one end explicitly.
            if args.min is not None:
                low = args.min
            if args.max is not None:
                high = args.max
    print()

    stretch(
        args.input,
        args.output,
        band=args.band,
        low=low,
        high=high,
        nodata=args.nodata,
        blocksize=args.blocksize,
        compress=args.compress,
    )

    print("Next: tile the 8-bit mosaic into a PNG pyramid:")
    print(
        f"  pixi run python raster_to_tiles.py {args.output} "
        f"{args.output.with_name(args.output.stem.replace('_8bit', '') + '_tiles')} "
        f"--profile raster"
    )


if __name__ == "__main__":
    main()
