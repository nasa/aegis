#!/usr/bin/env python3
"""Convert a classified Byte GeoTIFF mask into an RGBA GeoTIFF."""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

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
    *,
    allow_missing_nodata: bool = False,
) -> dict[int, int]:
    """Verify that a mask contains only its declared classes."""
    dataset = gdal.Open(str(input_path), gdal.GA_ReadOnly)
    if dataset is None:
        raise ValueError(f"Unable to open GeoTIFF: {input_path}")
    if dataset.RasterCount != 1:
        raise ValueError(f"Expected one Byte band, found {dataset.RasterCount} bands")

    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte:
        raise ValueError(f"Expected a Byte band, found GDAL data type {band.DataType}")
    source_nodata = band.GetNoDataValue()
    if source_nodata != nodata_value and not (
        allow_missing_nodata and source_nodata is None
    ):
        raise ValueError(
            f"Expected nodata value {nodata_value}, found {source_nodata!r}"
        )

    allowed = {*transparent_values, fill_value, nodata_value}
    counts = band.GetHistogram(0, 256, 256, include_out_of_range=True, approx_ok=False)
    class_counts = {value: count for value, count in enumerate(counts) if count}
    values = set(class_counts)
    dataset = None

    unexpected = values - allowed
    if unexpected:
        raise ValueError(
            f"Unexpected raster values {sorted(unexpected)}; expected only {sorted(allowed)}"
        )
    if require_fill_value and fill_value not in values:
        raise ValueError(f"No fill pixels with value {fill_value} were found")
    return class_counts


def _parse_class_color(entry: dict[str, Any]) -> tuple[int, int, int]:
    """Read and cross-check one class color from its JSON hex/RGB fields."""
    value = entry.get("value")
    rgb = entry.get("rgb")
    if (
        not isinstance(rgb, list)
        or len(rgb) != 3
        or any(
            not isinstance(channel, int) or not 0 <= channel <= 255 for channel in rgb
        )
    ):
        raise ValueError(f"Class {value!r} must have three integer RGB channels")
    color = tuple(rgb)
    hex_value = entry.get("hex")
    if hex_value is not None and parse_hex_color(str(hex_value)) != color:
        raise ValueError(f"Class {value!r} has inconsistent hex and RGB colors")
    return color


def load_class_definition(
    definition_path: Path, product: str
) -> tuple[dict[str, Any], list[dict[str, Any]], int]:
    """Load one explicitly selected product from a communications class JSON."""
    document = json.loads(definition_path.read_text(encoding="utf-8"))
    classes = document.get("classes")
    declared_product = document.get("product")
    if classes is not None:
        if declared_product and str(declared_product).casefold() != product.casefold():
            raise ValueError(
                f"Definition product {declared_product!r} does not match selected product {product!r}"
            )
        selected = document
    else:
        products = document.get("products")
        if not isinstance(products, dict):
            raise ValueError("Class definition must contain 'classes' or 'products'")
        matching = [key for key in products if key.casefold() == product.casefold()]
        if len(matching) != 1:
            raise ValueError(
                f"Product {product!r} is not uniquely defined; available products: {sorted(products)}"
            )
        selected = products[matching[0]]
        classes = selected.get("classes")

    if not isinstance(classes, list) or not classes:
        raise ValueError(f"Product {product!r} has no classes")
    nodata = document.get("nodata")
    if not isinstance(nodata, int) or not 0 <= nodata <= 255:
        raise ValueError("Class definition must declare a Byte 'nodata' value")

    seen: set[int] = set()
    normalized: list[dict[str, Any]] = []
    for entry in classes:
        if not isinstance(entry, dict):
            raise ValueError("Every class must be an object")
        value = entry.get("value")
        label = entry.get("label")
        if not isinstance(value, int) or not 0 <= value <= 255:
            raise ValueError(f"Invalid Byte class value: {value!r}")
        if value == nodata or value in seen:
            raise ValueError(f"Duplicate class value or nodata collision: {value}")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"Class {value} must have a non-empty label")
        color = _parse_class_color(entry)
        normalized.append(
            {
                "value": value,
                "label": label,
                "color": color,
                "hex": f"#{color[0]:02X}{color[1]:02X}{color[2]:02X}",
            }
        )
        seen.add(value)

    declared_values = selected.get("data_values")
    if declared_values is not None and declared_values != [
        entry["value"] for entry in normalized
    ]:
        raise ValueError("data_values does not match the classes array in source order")
    return document, normalized, nodata


def validate_categorical_raster(
    input_path: Path, classes: list[dict[str, Any]], nodata_value: int
) -> tuple[dict[int, int], dict[str, Any]]:
    """Validate source values and its embedded palette against a selected JSON product."""
    dataset = gdal.Open(str(input_path), gdal.GA_ReadOnly)
    if dataset is None:
        raise ValueError(f"Unable to open GeoTIFF: {input_path}")
    if dataset.RasterCount != 1:
        raise ValueError(f"Expected one Byte band, found {dataset.RasterCount} bands")
    band = dataset.GetRasterBand(1)
    if band.DataType != gdal.GDT_Byte:
        raise ValueError(
            f"Expected a Byte band, found {gdal.GetDataTypeName(band.DataType)}"
        )
    if band.GetNoDataValue() != nodata_value:
        raise ValueError(
            f"Expected nodata value {nodata_value}, found {band.GetNoDataValue()!r}"
        )

    counts_counter: Counter[int] = Counter()
    block_width, block_height = band.GetBlockSize()
    block_width = block_width or dataset.RasterXSize
    block_height = block_height or 1
    for y_offset in range(0, dataset.RasterYSize, block_height):
        height = min(block_height, dataset.RasterYSize - y_offset)
        for x_offset in range(0, dataset.RasterXSize, block_width):
            width = min(block_width, dataset.RasterXSize - x_offset)
            block = band.ReadRaster(x_offset, y_offset, width, height)
            if block is None:
                raise ValueError("Unable to read a source raster block")
            counts_counter.update(block)
    counts = dict(counts_counter)
    allowed = {entry["value"] for entry in classes} | {nodata_value}
    unexpected = set(counts) - allowed
    if unexpected:
        raise ValueError(
            f"Unexpected raster values {sorted(unexpected)}; expected only {sorted(allowed)}"
        )

    palette = band.GetColorTable()
    if palette is None:
        raise ValueError("Source raster has no embedded TIFF palette")
    for entry in classes:
        palette_entry = palette.GetColorEntry(entry["value"])
        if palette_entry is None or tuple(palette_entry[:3]) != entry["color"]:
            raise ValueError(
                f"Palette color for class {entry['value']} is {palette_entry!r}; "
                f"expected {entry['color']}"
            )

    metadata = {
        "width": dataset.RasterXSize,
        "height": dataset.RasterYSize,
        "bands": dataset.RasterCount,
        "data_type": gdal.GetDataTypeName(band.DataType),
        "nodata": band.GetNoDataValue(),
        "geotransform": list(dataset.GetGeoTransform()),
        "projection_wkt": dataset.GetProjection(),
    }
    dataset = None
    return counts, metadata


def sha256_file(path: Path) -> str:
    """Return a streaming SHA-256 checksum for an audit record."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    allow_missing_nodata: bool = False,
) -> None:
    """Create an RGBA GeoTIFF with only the fill class rendered."""
    validate_classified_mask(
        input_path,
        transparent_values,
        fill_value,
        nodata_value,
        require_fill_value,
        allow_missing_nodata=allow_missing_nodata,
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


def colorize_categorical_raster(
    input_path: Path,
    output_path: Path,
    classes: list[dict[str, Any]],
    nodata_value: int,
) -> None:
    """Expand exact class values into an RGBA GeoTIFF with transparent nodata."""
    gdaldem = shutil.which("gdaldem")
    if not gdaldem:
        raise RuntimeError("gdaldem was not found; run this converter through pixi")
    rows = ["# <value> <red> <green> <blue> <alpha>", "nv 0 0 0 0"]
    rows.extend(
        f"{entry['value']} {entry['color'][0]} {entry['color'][1]} {entry['color'][2]} 255"
        for entry in classes
    )
    rows.extend((f"{nodata_value} 0 0 0 0", ""))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        prefix="aegis_categorical_ramp_",
        delete=False,
        encoding="utf-8",
    ) as temporary_file:
        temporary_file.write("\n".join(rows))
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
