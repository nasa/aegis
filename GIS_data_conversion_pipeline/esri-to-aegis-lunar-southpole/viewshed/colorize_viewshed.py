#!/usr/bin/env python3
"""Convert a classified viewshed GeoTIFF into an RGBA raster.

The delivered viewsheds use one Byte band: 1 for visible, 2 for non-visible,
and 255 for nodata. This converter preserves the georeferencing and maps
visible and nodata pixels to transparent while coloring the non-visible mask.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from osgeo import gdal

gdal.UseExceptions()

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def parse_hex_color(value: str) -> tuple[int, int, int]:
    """Parse a six-digit CSS hex color into RGB channels."""
    raw = value.removeprefix("#")
    if len(raw) != 6:
        raise argparse.ArgumentTypeError(
            "fill color must be a six-digit hex color, e.g. #FFA77F"
        )
    try:
        return tuple(int(raw[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError as error:
        raise argparse.ArgumentTypeError(f"invalid fill color: {value!r}") from error


def validate_viewshed(
    input_path: Path, visible_value: int, nonvisible_value: int, nodata_value: int
) -> None:
    """Verify that the raster only contains the expected viewshed classes."""
    dataset = gdal.Open(str(input_path), gdal.GA_ReadOnly)
    if dataset is None:
        raise ValueError(f"Unable to open GeoTIFF: {input_path}")
    if dataset.RasterCount != 1:
        raise ValueError(f"Expected one Byte band, found {dataset.RasterCount} bands")

    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte:
        raise ValueError(f"Expected a Byte band, found GDAL data type {band.DataType}")
    if band.GetNoDataValue() != nodata_value:
        raise ValueError(
            f"Expected nodata value {nodata_value}, found {band.GetNoDataValue()!r}"
        )

    allowed = {visible_value, nonvisible_value, nodata_value}
    counts = band.GetHistogram(0, 256, 256, include_out_of_range=True, approx_ok=False)
    values = {value for value, count in enumerate(counts) if count}
    dataset = None

    unexpected = values - allowed
    if unexpected:
        raise ValueError(
            f"Unexpected raster values {sorted(unexpected)}; expected only {sorted(allowed)}"
        )
    if nonvisible_value not in values:
        raise ValueError(
            f"No non-visible pixels with value {nonvisible_value} were found"
        )


def build_color_table(
    visible_value: int,
    nonvisible_value: int,
    nodata_value: int,
    color: tuple[int, int, int],
    opacity: float,
) -> str:
    """Return an exact GDAL color-relief table for the viewshed classes."""
    red, green, blue = color
    alpha = round(opacity * 255)
    return "\n".join(
        (
            "# <value> <red> <green> <blue> <alpha>",
            "# visible and nodata stay transparent",
            "nv 0 0 0 0",
            f"{nodata_value} 0 0 0 0",
            f"{visible_value} 0 0 0 0",
            f"{nonvisible_value} {red} {green} {blue} {alpha}",
            "",
        )
    )


def colorize_viewshed(
    input_path: Path,
    output_path: Path,
    visible_value: int,
    nonvisible_value: int,
    nodata_value: int,
    color: tuple[int, int, int],
    opacity: float,
) -> None:
    """Create an RGBA GeoTIFF with transparent visible and nodata pixels."""
    validate_viewshed(input_path, visible_value, nonvisible_value, nodata_value)

    gdaldem = shutil.which("gdaldem")
    if not gdaldem:
        raise RuntimeError("gdaldem was not found; run this converter through pixi")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    color_table = build_color_table(
        visible_value, nonvisible_value, nodata_value, color, opacity
    )
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        prefix="aegis_viewshed_ramp_",
        delete=False,
        encoding="utf-8",
    ) as temporary_file:
        temporary_file.write(color_table)
        color_table_path = Path(temporary_file.name)

    try:
        subprocess.run(
            [
                gdaldem,
                "color-relief",
                str(input_path),
                str(color_table_path),
                str(output_path),
                "-alpha",
                "-exact_color_entry",
                "-of",
                "GTiff",
                "-co",
                "TILED=YES",
                "-co",
                "COMPRESS=DEFLATE",
                "-co",
                "BIGTIFF=IF_SAFER",
            ],
            check=True,
        )
    finally:
        color_table_path.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a classified 1/2/255 viewshed GeoTIFF to an RGBA raster."
    )
    parser.add_argument("input", type=Path, help="Input classified viewshed GeoTIFF.")
    parser.add_argument("output", type=Path, help="Output RGBA GeoTIFF.")
    parser.add_argument("--visible-value", type=int, required=True)
    parser.add_argument("--nonvisible-value", type=int, required=True)
    parser.add_argument("--nodata-value", type=int, required=True)
    parser.add_argument("--fill-color", type=parse_hex_color, required=True)
    parser.add_argument("--fill-opacity", type=float, required=True)
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f"Input GeoTIFF does not exist: {args.input}")
    if not 0 <= args.fill_opacity <= 1:
        parser.error("--fill-opacity must be between 0 and 1")
    if len({args.visible_value, args.nonvisible_value, args.nodata_value}) != 3:
        parser.error("visible, non-visible, and nodata values must be distinct")

    print("Viewshed GeoTIFF -> RGBA GeoTIFF")
    print(f"  Input:  {args.input}")
    print(f"  Output: {args.output}")
    print(
        "  Classes: "
        f"visible={args.visible_value} transparent, "
        f"non-visible={args.nonvisible_value} #{args.fill_color[0]:02X}{args.fill_color[1]:02X}{args.fill_color[2]:02X} "
        f"at {args.fill_opacity:.0%}, nodata={args.nodata_value} transparent"
    )

    colorize_viewshed(
        args.input,
        args.output,
        args.visible_value,
        args.nonvisible_value,
        args.nodata_value,
        args.fill_color,
        args.fill_opacity,
    )


if __name__ == "__main__":
    main()
