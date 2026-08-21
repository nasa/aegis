#!/usr/bin/env python3
"""Create a compact UInt16 analytical slope COG and exact color-ramp JSON."""

from __future__ import annotations

import argparse
import json
import re
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


def parse_ramp(path: Path) -> tuple[list[dict], list[int]]:
    """Parse a GDAL color-relief table without compacting its exact stops."""
    stops: list[dict] = []
    nodata_color = [0, 0, 0, 0]
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = [part for part in re.split(r"[\s,]+", line) if part]
        if len(parts) < 4:
            continue
        rgba = [int(value) for value in parts[1:5]]
        if len(rgba) == 3:
            rgba.append(255)
        if parts[0].lower() == "nv":
            nodata_color = rgba
        else:
            stops.append({"value": float(parts[0]), "rgba": rgba})
    return stops, nodata_color


def write_ramp_json(ramp: Path, output: Path) -> None:
    stops, nodata_color = parse_ramp(ramp)
    payload = {
        "version": 1,
        "units": "degrees",
        "encoding": {
            "dataType": "uint16",
            "scale": SCALE,
            "offset": 0,
            "noData": NODATA,
            "decode": "degrees = storedValue * scale + offset",
        },
        "colorRamp": {
            "interpolation": "linear",
            "noDataRgba": nodata_color,
            "stops": stops,
        },
        "sourceRamp": ramp.name,
    }
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def build(dem: Path, output: Path, ramp: Path, ramp_output: Path) -> None:
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
    write_ramp_json(ramp, ramp_output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dem", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--ramp", type=Path, required=True)
    parser.add_argument("--ramp-out", type=Path, required=True)
    args = parser.parse_args()
    build(
        args.dem.resolve(),
        args.out.resolve(),
        args.ramp.resolve(),
        args.ramp_out.resolve(),
    )


if __name__ == "__main__":
    main()
