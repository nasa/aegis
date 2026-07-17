"""Quick inspection of a GeoTIFF to understand its properties."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import rasterio
from rasterio.crs import CRS


def inspect(path: Path) -> None:
    with rasterio.open(path) as ds:
        print("=" * 60)
        print(f"File: {path}")
        print("=" * 60)

        # Dimensions
        cols = ds.width
        rows = ds.height
        bands = ds.count
        print(f"  Dimensions:   {cols} x {rows} px  ({bands} band(s))")
        print(f"  Dtype:        {ds.dtypes}")
        import numpy as np

        bytes_per_px = sum(np.dtype(d).itemsize for d in ds.dtypes)
        print(
            f"  Approx size:  {cols * rows * bytes_per_px / (1024**3):.1f} GB uncompressed"
        )

        # Bands
        for i in range(1, min(bands + 1, 5)):
            dt = ds.dtypes[i - 1]
            nodata = ds.nodatavals[i - 1]
            # Read a small sample for quick stats (don't read the whole 129 GB!)
            win = rasterio.windows.Window(cols // 2 - 500, rows // 2 - 500, 1000, 1000)
            try:
                sample = ds.read(i, window=win)
                print(
                    f"  Band {i}: dtype={dt}, nodata={nodata}, sample_min={sample.min():.2f}, sample_max={sample.max():.2f}, sample_mean={sample.mean():.2f}"
                )
            except Exception as e:
                print(
                    f"  Band {i}: dtype={dt}, nodata={nodata}, (sample read failed: {e})"
                )

        # Transform
        gt = ds.transform
        print(f"\n  Transform:    {gt}")
        print(f"  Pixel size:   {gt.a:.6f} x {abs(gt.e):.6f} (map units)")
        print(f"  Origin:       ({gt.c:.2f}, {gt.f:.2f})")
        bounds = ds.bounds
        print(f"  Bounds:       left={bounds.left:.2f}, bottom={bounds.bottom:.2f}")
        print(f"                right={bounds.right:.2f}, top={bounds.top:.2f}")

        # Projection
        crs: CRS = ds.crs
        print(f"\n  CRS:          {crs}")
        print(f"  CRS WKT:      {crs.to_wkt()[:200]}...")
        print(f"  PROJ4:        {crs.to_proj4()}")
        try:
            print(f"  EPSG:         {crs.to_epsg()}")
        except Exception:
            print(f"  EPSG:         (unknown)")
        print(f"  Linear unit:  {crs.linear_units}")

        # Overviews
        band1_overviews = ds.overviews(1)
        print(f"\n  Overviews:    {len(band1_overviews)}")
        for j, factor in enumerate(band1_overviews):
            print(f"    [{j}] factor={factor} → {cols // factor} x {rows // factor}")

        # Compression / tiling
        profile = ds.profile
        print(f"\n  Driver:       {profile.get('driver')}")
        print(f"  Compression:  {profile.get('compress', 'NONE')}")
        print(f"  Interleave:   {profile.get('interleave', 'N/A')}")
        print(f"  Tiled:        {profile.get('tiled', False)}")
        print(
            f"  Block size:   {profile.get('blockxsize', 'N/A')} x {profile.get('blockysize', 'N/A')}"
        )

        # Tags / metadata
        tags = ds.tags()
        if tags:
            print(f"\n  Tags:")
            for k, v in list(tags.items())[:10]:
                print(f"    {k}: {v}")

    # File size
    file_size = path.stat().st_size
    print(f"\n  File on disk: {file_size / (1024**3):.2f} GB")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect a GeoTIFF file")
    parser.add_argument("path", type=Path, help="Path to the GeoTIFF")
    args = parser.parse_args()
    inspect(args.path)


if __name__ == "__main__":
    main()
