"""Verify whether a candidate DEM is in true meters or scaled (e.g. x1000).

OPTIONAL HELPER — not part of the baseline A03MP026 mission. AEGIS uses exactly
one DEM (``mission.demFilePath``), and the 1 mpp SfS DEM covers the whole
operational area, so the 5 mpp "scaled" site DEM is not needed for elevation or
slope. Run this only if someone later wants that 5 mpp DEM as a *display*
overlay and you must confirm its vertical units first (the filename
``SiteUD1_5mpp_scaled.tif`` and the GMT ``x1000`` history on sibling DEMs make
this worth checking — see SITE_A03MP026 §4.4).

What it does:
  1. Samples a reference DEM (known-good meters, e.g. the 1 mpp SfS DEM) and a
     candidate DEM over a small grid centred on a lon/lat (the ellipse center),
     reprojecting the sample points into each DEM's CRS.
  2. Reports the candidate/reference ratio and offset. A ratio near 1000 ⇒ the
     candidate was multiplied by 1000 and needs ``x0.001`` to become meters; a
     ratio near 1 ⇒ it is already meters.
  3. With ``--emit-corrected``, writes a scale-corrected COG of the candidate so
     it can be used as a display layer in true meters.

Uses rasterio (bundles GDAL) + pyproj — no system GDAL needed:

    uv run --with pyproj python verify_dem_units.py \\
        --reference .../mp2-sfs-dem_MoonSP_COG.tif \\
        --candidate .../SiteUD1_5mpp_scaled.tif \\
        --lat -84.223397 --lon 33.5021945

Add ``--emit-corrected out.tif --scale 0.001`` to write a corrected COG.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
import rasterio.shutil
from pyproj import Transformer

# Force UTF-8 stdout/stderr so Unicode in help/progress text doesn't crash on a
# default cp1252 Windows console (no need to set PYTHONUTF8=1 first).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def make_parser(**kwargs) -> argparse.ArgumentParser:
    """ArgumentParser that accepts space-separated negative numbers, incl.
    scientific notation (e.g. ``--lat -84.22`` / ``--nodata -3.4e38``).

    argparse's built-in negative-number detection is narrow enough that some
    negative values are mistaken for option flags ("expected one argument").
    Widening the matcher lets natural space-separated negatives work.
    """
    parser = argparse.ArgumentParser(**kwargs)
    parser._negative_number_matcher = re.compile(  # type: ignore[attr-defined]
        r"^-\d+$|^-\d*\.?\d+(?:[eE][-+]?\d+)?$"
    )
    return parser


def sample_grid(
    ds: rasterio.DatasetReader,
    lon: float,
    lat: float,
    half_n: int,
    step_m: float,
) -> np.ndarray:
    """Sample a (2*half_n+1)^2 grid of points centred on lon/lat in the DEM's CRS.

    Returns the finite, non-nodata sampled values (may be empty).
    """
    # lon/lat (EPSG:4326) → the DEM's projected CRS.
    transformer = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
    cx, cy = transformer.transform(lon, lat)

    coords = []
    for j in range(-half_n, half_n + 1):
        for i in range(-half_n, half_n + 1):
            coords.append((cx + i * step_m, cy + j * step_m))

    nodata = ds.nodatavals[0]
    vals: list[float] = []
    for v in ds.sample(coords, indexes=1):
        x = float(v[0])
        if not np.isfinite(x):
            continue
        if nodata is not None and np.isfinite(nodata) and x == nodata:
            continue
        vals.append(x)
    return np.asarray(vals, dtype="float64")


def emit_corrected_cog(
    candidate: Path,
    out_path: Path,
    scale: float,
) -> None:
    """Write a scale-corrected COG of the candidate DEM (value * scale)."""
    print("-" * 60)
    print(f"Emitting scale-corrected COG (x{scale})")
    print("-" * 60)
    with rasterio.open(candidate) as src:
        profile = src.profile.copy()
        nodata = src.nodatavals[0]
        # Build a temp GTiff, then copy to COG for clean overviews/tiling.
        tmp = out_path.with_suffix(".scaled.tmp.tif")
        profile.update(driver="GTiff", dtype="float32", BIGTIFF="IF_SAFER")
        out_path.parent.mkdir(parents=True, exist_ok=True)

        t0 = time.time()
        with rasterio.open(tmp, "w", **profile) as dst:
            for _, window in src.block_windows(1):
                arr = src.read(1, window=window).astype("float64", copy=False)
                if nodata is not None and np.isfinite(nodata):
                    mask = arr == nodata
                    arr = arr * scale
                    arr[mask] = nodata
                else:
                    arr = arr * scale
                dst.write(arr.astype("float32"), 1, window=window)

        rasterio.shutil.copy(
            str(tmp),
            str(out_path),
            driver="COG",
            compress="zstd",
            predictor="yes",
            num_threads="all_cpus",
            overview_resampling="average",
            BIGTIFF="YES",
        )
        tmp.unlink(missing_ok=True)
    print(f"  Wrote {out_path} in {time.time() - t0:.0f}s")
    print()


def main() -> None:
    parser = make_parser(
        description=(
            "Check whether a candidate DEM is in true meters or scaled (x1000)\n"
            "by comparing samples to a known-good reference DEM at a lon/lat.\n"
            "OPTIONAL — not needed for the baseline A03MP026 mission."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example:\n"
            "  uv run --with pyproj python verify_dem_units.py \\\n"
            "      --reference mp2-sfs-dem_MoonSP_COG.tif \\\n"
            "      --candidate SiteUD1_5mpp_scaled.tif \\\n"
            "      --lat -84.223397 --lon 33.5021945\n"
        ),
    )
    parser.add_argument(
        "--reference", type=Path, required=True, help="Known-good DEM (meters)"
    )
    parser.add_argument("--candidate", type=Path, required=True, help="DEM under test")
    parser.add_argument(
        "--lat", type=float, required=True, help="Sample center latitude (deg)"
    )
    parser.add_argument(
        "--lon", type=float, required=True, help="Sample center longitude (deg)"
    )
    parser.add_argument(
        "--half-n",
        type=int,
        default=5,
        help="Half grid size: samples a (2N+1)^2 grid (default: 5 → 11x11)",
    )
    parser.add_argument(
        "--step-m",
        type=float,
        default=10.0,
        help="Grid spacing in meters (default: 10)",
    )
    parser.add_argument(
        "--emit-corrected",
        type=Path,
        default=None,
        help="If set, write a scale-corrected COG of the candidate here",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=0.001,
        help="Scale factor for --emit-corrected (default: 0.001 = divide by 1000)",
    )

    args = parser.parse_args()

    for p in (args.reference, args.candidate):
        if not p.exists():
            print(f"ERROR: file not found: {p}", file=sys.stderr)
            sys.exit(1)

    print("=" * 60)
    print("Verify DEM Units")
    print("=" * 60)
    print(f"  Reference: {args.reference}")
    print(f"  Candidate: {args.candidate}")
    print(f"  Center:    lat={args.lat}, lon={args.lon}")
    print(f"  Grid:      {2 * args.half_n + 1}x{2 * args.half_n + 1} @ {args.step_m} m")
    print()

    with rasterio.open(args.reference) as ref_ds:
        ref_vals = sample_grid(ref_ds, args.lon, args.lat, args.half_n, args.step_m)
    with rasterio.open(args.candidate) as cand_ds:
        cand_vals = sample_grid(cand_ds, args.lon, args.lat, args.half_n, args.step_m)

    if ref_vals.size == 0 or cand_vals.size == 0:
        print(
            "ERROR: no valid samples for "
            f"{'reference' if ref_vals.size == 0 else 'candidate'} "
            "(point outside extent or all nodata).",
            file=sys.stderr,
        )
        sys.exit(1)

    ref_mean = float(ref_vals.mean())
    cand_mean = float(cand_vals.mean())
    ratio = cand_mean / ref_mean if ref_mean != 0 else float("inf")
    offset = cand_mean - ref_mean

    print("-" * 60)
    print("Results")
    print("-" * 60)
    print(f"  Reference mean: {ref_mean:.3f} m   (n={ref_vals.size})")
    print(f"  Candidate mean: {cand_mean:.3f}     (n={cand_vals.size})")
    print(f"  Ratio (cand/ref): {ratio:.4f}")
    print(f"  Offset (cand-ref): {offset:.3f}")
    print()

    if 0.5 < ratio < 2.0:
        print("  → Verdict: candidate appears to already be in METERS (ratio ~1).")
    elif 500 < ratio < 2000:
        print(
            "  → Verdict: candidate appears SCALED by ~1000. Apply x0.001 to get meters."
        )
    else:
        print("  → Verdict: inconclusive — inspect manually before using as a layer.")
    print()

    if args.emit_corrected:
        emit_corrected_cog(args.candidate, args.emit_corrected, args.scale)


if __name__ == "__main__":
    main()
