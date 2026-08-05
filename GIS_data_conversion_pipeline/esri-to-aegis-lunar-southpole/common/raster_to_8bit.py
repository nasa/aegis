"""Percentile-stretch a float raster to single-band 8-bit grayscale.

This converter is shared by generic raster tile layers. It:
  1. Samples the input with decimated reads and computes low/high percentile cuts,
     ignoring nodata.
  2. Linearly rescales ``[low, high]`` to ``[1, 255]`` block-by-block.
  3. Reserves output value ``0`` as nodata so the fill area is transparent.
  4. Writes a tiled uint8 GeoTIFF, preserving the source CRS and transform.

Because it uses rasterio (which bundles its own GDAL), this script runs under
``pixi run`` without requiring GDAL CLI tools on PATH.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

import numpy as np
import rasterio

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def make_parser(**kwargs) -> argparse.ArgumentParser:
    """Allow scientific-notation negative values as separate option arguments."""
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
    """Compute percentile cuts from a bounded, decimated sample of the input band."""
    full = src.width * src.height
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
    src_nodata = src.nodatavals[band - 1]
    if src_nodata is not None and np.isfinite(src_nodata):
        mask &= data != src_nodata

    valid = data[mask]
    if valid.size == 0:
        print("ERROR: no valid pixels found to sample.", file=sys.stderr)
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
    """Rescale a band into a tiled uint8 GeoTIFF with zero as nodata."""
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
        total_blocks = -(-src.height // blocksize) * -(-src.width // blocksize)
        next_pct = 10
        with rasterio.open(dst_path, "w", **profile) as dst:
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
                out[~valid] = 0

                dst.write(out, 1, window=window)
                n_blocks += 1
                if total_blocks and n_blocks / total_blocks * 100 >= next_pct:
                    print(
                        f"    {n_blocks:,}/{total_blocks:,} blocks "
                        f"({n_blocks / total_blocks * 100:3.0f}%)  {time.time() - t0:.0f}s",
                        flush=True,
                    )
                    next_pct += 10

        elapsed = time.time() - t0
        size_mb = dst_path.stat().st_size / (1024**2)
        print(f"  Wrote {n_blocks:,} blocks in {elapsed:.0f}s → {size_mb:.1f} MB")
        print()


def main() -> None:
    parser = make_parser(
        description=(
            "Percentile-stretch a float raster to single-band 8-bit grayscale.\n"
            "Output value 0 is reserved as transparent nodata.\n"
            "Needs no GDAL CLI (rasterio bundles GDAL)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="Input raster")
    parser.add_argument("output", type=Path, help="Output 8-bit grayscale GeoTIFF")
    parser.add_argument("--band", type=int, default=1, help="Source band (default: 1)")
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
    parser.add_argument("--min", type=float, default=None, help="Explicit low cut")
    parser.add_argument("--max", type=float, default=None, help="Explicit high cut")
    parser.add_argument(
        "--nodata", type=float, default=None, help="Extra input nodata value to ignore"
    )
    parser.add_argument(
        "--blocksize", type=int, default=512, help="Output block size (default: 512)"
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
        help="Maximum percentile sample size (default: 5,000,000)",
    )

    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("Stretch Raster → 8-bit Grayscale")
    print("=" * 60)
    print(f"  Input:  {args.input.resolve()}")
    print(f"  Output: {args.output.resolve()}")
    print()

    with rasterio.open(args.input) as src:
        if args.min is not None and args.max is not None:
            low, high = args.min, args.max
            if high <= low:
                print(
                    f"ERROR: --max ({high}) must exceed --min ({low}).",
                    file=sys.stderr,
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


if __name__ == "__main__":
    main()
