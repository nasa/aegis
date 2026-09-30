#!/usr/bin/env python3
"""Convert a classified Byte GeoTIFF mask into an RGBA GeoTIFF."""

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


def validate_classified_mask(
    input_path: Path,
    transparent_values: tuple[int, ...],
    fill_value: int,
    nodata_value: int,
    require_fill_value: bool,
) -> None:
    """Verify that a mask contains only its declared classes."""
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

    allowed = {*transparent_values, fill_value, nodata_value}
    counts = band.GetHistogram(0, 256, 256, include_out_of_range=True, approx_ok=False)
    values = {value for value, count in enumerate(counts) if count}
    dataset = None

    unexpected = values - allowed
    if unexpected:
        raise ValueError(
            f"Unexpected raster values {sorted(unexpected)}; expected only {sorted(allowed)}"
        )
    if require_fill_value and fill_value not in values:
        raise ValueError(f"No fill pixels with value {fill_value} were found")


def build_color_table(
    transparent_values: tuple[int, ...],
    fill_value: int,
    nodata_value: int,
    color: tuple[int, int, int],
    opacity: float,
) -> str:
    """Return an exact GDAL color-relief table for a classified mask."""
    red, green, blue = color
    alpha = round(opacity * 255)
    entries = [
        "# <value> <red> <green> <blue> <alpha>",
        "# transparent and nodata classes stay transparent",
        "nv 0 0 0 0",
        f"{nodata_value} 0 0 0 0",
        *(f"{value} 0 0 0 0" for value in transparent_values),
        f"{fill_value} {red} {green} {blue} {alpha}",
        "",
    ]
    return "\n".join(entries)


def colorize_classified_mask(
    input_path: Path,
    output_path: Path,
    transparent_values: tuple[int, ...],
    fill_value: int,
    nodata_value: int,
    color: tuple[int, int, int],
    opacity: float,
    require_fill_value: bool = True,
) -> None:
    """Create an RGBA GeoTIFF with only the fill class rendered."""
    validate_classified_mask(
        input_path,
        transparent_values,
        fill_value,
        nodata_value,
        require_fill_value,
    )

    gdaldem = shutil.which("gdaldem")
    if not gdaldem:
        raise RuntimeError("gdaldem was not found; run this converter through pixi")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    color_table = build_color_table(
        transparent_values, fill_value, nodata_value, color, opacity
    )
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        prefix="aegis_classified_mask_ramp_",
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
        description="Convert a classified Byte GeoTIFF mask to an RGBA raster."
    )
    parser.add_argument("input", type=Path, help="Input classified GeoTIFF.")
    parser.add_argument("output", type=Path, help="Output RGBA GeoTIFF.")
    parser.add_argument(
        "--transparent-value",
        type=int,
        action="append",
        default=[],
        help="Class to render transparent; repeatable and optional.",
    )
    parser.add_argument("--fill-value", type=int, required=True)
    parser.add_argument("--nodata-value", type=int, required=True)
    parser.add_argument("--fill-color", type=parse_hex_color, required=True)
    parser.add_argument("--fill-opacity", type=float, required=True)
    parser.add_argument(
        "--require-fill-value",
        action="store_true",
        help="Fail when the input has no pixels with --fill-value.",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f"Input GeoTIFF does not exist: {args.input}")
    if not 0 <= args.fill_opacity <= 1:
        parser.error("--fill-opacity must be between 0 and 1")
    class_values = [*args.transparent_value, args.fill_value, args.nodata_value]
    if len(class_values) != len(set(class_values)):
        parser.error("transparent, fill, and nodata values must be distinct")

    print("Classified GeoTIFF -> RGBA GeoTIFF")
    print(f"  Input:  {args.input}")
    print(f"  Output: {args.output}")
    transparent_description = (
        f"transparent={args.transparent_value}, " if args.transparent_value else ""
    )
    print(
        "  Classes: "
        f"{transparent_description}"
        f"fill={args.fill_value} #{args.fill_color[0]:02X}{args.fill_color[1]:02X}{args.fill_color[2]:02X} "
        f"at {args.fill_opacity:.0%}, nodata={args.nodata_value} transparent"
    )

    colorize_classified_mask(
        args.input,
        args.output,
        tuple(args.transparent_value),
        args.fill_value,
        args.nodata_value,
        args.fill_color,
        args.fill_opacity,
        args.require_fill_value,
    )


if __name__ == "__main__":
    main()
