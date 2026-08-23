#!/usr/bin/env python3
"""Create a compact UInt16 analytical slope COG."""

from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from osgeo import gdal

gdal.UseExceptions()

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

SCALE = 0.01
NODATA = 65535


def build(dem: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        dir=output.parent, prefix="slope-build-"
    ) as temp_dir:
        float_tif = Path(temp_dir) / "slope_float32.tif"
        scaled_vrt = Path(temp_dir) / "slope_uint16.vrt"

        gdal.DEMProcessing(
            str(float_tif),
            str(dem),
            "slope",
            computeEdges=True,
            slopeFormat="degree",
            format="GTiff",
            creationOptions=["TILED=YES", "COMPRESS=DEFLATE", "BIGTIFF=YES"],
        )
        vrt = gdal.Translate(
            str(scaled_vrt),
            str(float_tif),
            format="VRT",
            outputType=gdal.GDT_UInt16,
            scaleParams=[[0, 90, 0, 9000]],
            noData=NODATA,
        )
        band = vrt.GetRasterBand(1)
        band.SetScale(SCALE)
        band.SetOffset(0)
        vrt.FlushCache()
        vrt = None

        gdal.Translate(
            str(output),
            str(scaled_vrt),
            format="COG",
            creationOptions=[
                "COMPRESS=DEFLATE",
                "PREDICTOR=STANDARD",
                "BLOCKSIZE=512",
                "NUM_THREADS=ALL_CPUS",
                "BIGTIFF=YES",
                "OVERVIEWS=NONE",
            ],
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dem", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    build(args.dem.resolve(), args.out.resolve())


if __name__ == "__main__":
    main()
