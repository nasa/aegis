#!/usr/bin/env python3
"""Generate GDAL Horn-slope reference values for the TypeScript server tests."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import tempfile
from pathlib import Path

from osgeo import gdal, osr

gdal.UseExceptions()

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FIXTURE_DIRECTORY = REPOSITORY_ROOT / "src/tests/vitest/fixtures/raster"
DEFAULT_DEM = FIXTURE_DIRECTORY / "mission50-golden-tiled.tif"
DEFAULT_OUTPUT = FIXTURE_DIRECTORY / "terrain-slope-goldens.json"
GENERATOR_PATH = Path(__file__).resolve().relative_to(REPOSITORY_ROOT).as_posix()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_nodata(value: float, nodata: float | None) -> bool:
    if not math.isfinite(value):
        return True
    if nodata is None:
        return False
    if math.isnan(nodata):
        return math.isnan(value)
    return value == nodata


def build_corpus(dem_path: Path) -> dict:
    source = gdal.Open(str(dem_path), gdal.GA_ReadOnly)
    if source is None:
        raise RuntimeError(f"Unable to open DEM: {dem_path}")
    if source.RasterCount < 1:
        raise ValueError("The reference DEM must contain an elevation band")

    transform = source.GetGeoTransform()
    if transform[2] != 0 or transform[4] != 0:
        raise ValueError("Rotated or sheared reference DEMs are not supported")

    spatial_reference = osr.SpatialReference()
    spatial_reference.ImportFromWkt(source.GetProjection())
    if not spatial_reference.IsProjected() or not math.isclose(
        spatial_reference.GetLinearUnits(), 1.0
    ):
        raise ValueError("The reference DEM must use projected metre coordinates")
    spatial_reference.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    geographic = spatial_reference.CloneGeogCS()
    geographic.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    inverse = osr.CoordinateTransformation(spatial_reference, geographic)

    source_band = source.GetRasterBand(1)
    source_values = source_band.ReadAsArray()
    source_nodata = source_band.GetNoDataValue()

    with tempfile.TemporaryDirectory(
        prefix="terrain-slope-reference-"
    ) as temp_directory:
        slope_path = Path(temp_directory) / "slope.tif"
        slope = gdal.DEMProcessing(
            str(slope_path),
            source,
            "slope",
            alg="Horn",
            computeEdges=False,
            slopeFormat="degree",
            scale=1.0,
            format="GTiff",
        )
        if slope is None:
            raise RuntimeError("GDAL failed to generate the slope reference raster")
        slope_band = slope.GetRasterBand(1)
        slope_values = slope_band.ReadAsArray()
        slope_nodata = slope_band.GetNoDataValue()

        cases = []
        for pixel_y in range(source.RasterYSize):
            for pixel_x in range(source.RasterXSize):
                projected_x = transform[0] + (pixel_x + 0.25) * transform[1]
                projected_y = transform[3] + (pixel_y + 0.25) * transform[5]
                longitude, latitude, _ = inverse.TransformPoint(
                    projected_x, projected_y
                )
                elevation = float(source_values[pixel_y][pixel_x])
                expected_slope = float(slope_values[pixel_y][pixel_x])
                cases.append(
                    {
                        "pixel": [pixel_x, pixel_y],
                        "point": {"lat": latitude, "lng": longitude},
                        "rawElevation": (
                            None if is_nodata(elevation, source_nodata) else elevation
                        ),
                        "expectedSlopeDegrees": (
                            None
                            if is_nodata(expected_slope, slope_nodata)
                            else expected_slope
                        ),
                    }
                )

        slope = None

    return {
        "schemaVersion": 1,
        "generator": GENERATOR_PATH,
        "command": "pixi run terrain-slope-reference-corpus",
        "oracle": {
            "implementation": "GDAL DEMProcessing",
            "gdalVersion": gdal.VersionInfo("--version"),
            "algorithm": "Horn",
            "slopeFormat": "degree",
            "computeEdges": False,
            "scale": 1.0,
        },
        "raster": {
            "name": dem_path.name,
            "sha256": sha256(dem_path),
            "band": 1,
            "width": source.RasterXSize,
            "height": source.RasterYSize,
            "geoTransform": list(transform),
            "noData": source_nodata,
        },
        "cases": cases,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dem", type=Path, default=DEFAULT_DEM)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    dem_path = args.dem.resolve()
    output_path = args.out.resolve()
    corpus = build_corpus(dem_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(corpus, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(corpus['cases'])} GDAL slope cases to {output_path}")


if __name__ == "__main__":
    main()
