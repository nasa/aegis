#!/usr/bin/env python3
"""Colorize a continuous single-band raster with ArcGIS ``.lyrx`` class breaks → RGBA GeoTIFF.

Reads the first ``CIMRasterClassifyColorizer`` in the ``.lyrx`` and applies its manual class
breaks exactly, including each class colour's alpha (CIM stores alpha as a 0–100 percentage, so
a class with alpha 0 renders transparent). NoData pixels are always transparent.

Class semantics follow ArcGIS: class ``i`` covers ``(upperBound[i-1], upperBound[i]]``. The first
class is open below and the last class is open above, so every valid pixel is classified. CIM
JSON omits default-valued properties, so a class break with no ``upperBound`` means ``0``.
Breaks are compared in the source band's dtype so a float32 maximum equal to the last break is
not pushed outside it by double-precision rounding.

Usage (from GIS_data_conversion_pipeline/):
    pixi run python esri-to-aegis-lunar-southpole/common/colorize_lyrx_classified.py \\
        ice_depth.tif ice_depth_rgba.tif --lyrx ice_depth.lyrx --audit-out audit.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.windows import Window

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def parse_lyrx_classes(lyrx_path: Path) -> list[dict[str, Any]]:
    """Return ``[{upper_bound, label, rgba}, ...]`` sorted by upper bound."""
    document = json.loads(lyrx_path.read_text(encoding="utf-8"))
    colorizer = None
    for layer in document.get("layerDefinitions", []):
        candidate = layer.get("colorizer", {})
        if candidate.get("type") == "CIMRasterClassifyColorizer":
            colorizer = candidate
            break
    if colorizer is None:
        raise ValueError(f"No CIMRasterClassifyColorizer found in {lyrx_path}")

    classes: list[dict[str, Any]] = []
    for entry in colorizer.get("classBreaks", []):
        color = entry.get("color", {})
        if color.get("type") != "CIMRGBColor":
            raise ValueError(
                f"Class {entry.get('label')!r} uses {color.get('type')!r}; "
                "only CIMRGBColor is supported"
            )
        values = color.get("values", [])
        if len(values) not in (3, 4):
            raise ValueError(f"Class {entry.get('label')!r} has invalid colour values")
        alpha_pct = values[3] if len(values) == 4 else 100
        classes.append(
            {
                "upper_bound": float(entry.get("upperBound", 0.0)),
                "label": str(entry.get("label", "")).strip(),
                "rgba": (
                    round(values[0]),
                    round(values[1]),
                    round(values[2]),
                    round(alpha_pct * 255 / 100),
                ),
            }
        )
    if not classes:
        raise ValueError(f"No classBreaks found in {lyrx_path}")
    classes.sort(key=lambda item: item["upper_bound"])
    bounds = [item["upper_bound"] for item in classes]
    if len(set(bounds)) != len(bounds):
        raise ValueError(f"Duplicate class upper bounds in {lyrx_path}: {bounds}")
    return classes


def colorize(
    input_path: Path, output_path: Path, classes: list[dict[str, Any]]
) -> dict[str, Any]:
    """Write an RGBA GeoTIFF and return per-class pixel counts."""
    lut = np.array([item["rgba"] for item in classes], dtype=np.uint8)
    counts = np.zeros(len(classes), dtype=np.int64)
    nodata_count = 0

    with rasterio.open(input_path) as src:
        if src.count != 1:
            raise ValueError(f"Expected a single-band raster, found {src.count} bands")
        dtype = np.dtype(src.dtypes[0])
        if dtype.kind not in "fiu":
            raise ValueError(f"Unsupported raster dtype {dtype}")
        breaks = np.array([item["upper_bound"] for item in classes], dtype=dtype)

        profile = src.profile.copy()
        profile.update(
            driver="GTiff",
            dtype="uint8",
            count=4,
            nodata=None,
            tiled=True,
            blockxsize=512,
            blockysize=512,
            compress="deflate",
            BIGTIFF="IF_SAFER",
            photometric="RGB",
        )
        profile.pop("interleave", None)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with rasterio.open(output_path, "w", **profile) as dst:
            dst.colorinterp = (
                rasterio.enums.ColorInterp.red,
                rasterio.enums.ColorInterp.green,
                rasterio.enums.ColorInterp.blue,
                rasterio.enums.ColorInterp.alpha,
            )
            for row in range(0, src.height, 512):
                for col in range(0, src.width, 512):
                    window = Window(
                        col, row, min(512, src.width - col), min(512, src.height - row)
                    )
                    data = src.read(1, window=window, masked=True)
                    invalid = np.ma.getmaskarray(data)
                    values = np.ma.getdata(data)
                    if dtype.kind == "f":
                        invalid = invalid | ~np.isfinite(values)
                    index = np.searchsorted(breaks, values, side="left")
                    np.clip(index, 0, len(classes) - 1, out=index)
                    rgba = lut[index]
                    rgba[invalid] = 0
                    counts += np.bincount(index[~invalid], minlength=len(classes))
                    nodata_count += int(invalid.sum())
                    dst.write(np.moveaxis(rgba, -1, 0), window=window)

    return {
        "source": str(input_path.resolve()),
        "source_dtype": str(dtype),
        "nodata_pixels": nodata_count,
        "classes": [
            {
                "label": item["label"],
                "upper_bound": item["upper_bound"],
                "color": "#{:02X}{:02X}{:02X}".format(*item["rgba"][:3]),
                "alpha": item["rgba"][3],
                "pixel_count": int(count),
            }
            for item, count in zip(classes, counts)
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Colorize a raster with .lyrx class breaks into an RGBA GeoTIFF."
    )
    parser.add_argument("input", type=Path, help="Input single-band GeoTIFF.")
    parser.add_argument("output", type=Path, help="Output RGBA GeoTIFF.")
    parser.add_argument(
        "--lyrx", type=Path, required=True, help="ArcGIS .lyrx with class breaks."
    )
    parser.add_argument(
        "--audit-out", type=Path, default=None, help="Write class counts as JSON."
    )
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f"Input raster does not exist: {args.input}")
    if not args.lyrx.is_file():
        parser.error(f".lyrx does not exist: {args.lyrx}")

    classes = parse_lyrx_classes(args.lyrx)
    print("Classified raster (.lyrx) -> RGBA GeoTIFF")
    print(f"  Input:  {args.input}")
    print(f"  Style:  {args.lyrx}")
    print(f"  Output: {args.output}")
    audit = colorize(args.input, args.output, classes)
    audit["lyrx"] = str(args.lyrx.resolve())
    for entry in audit["classes"]:
        print(
            f"  <= {entry['upper_bound']:<12g} {entry['color']} alpha={entry['alpha']:<3} "
            f"{entry['pixel_count']:>12,} px  {entry['label']}"
        )
    print(f"  nodata: {audit['nodata_pixels']:,} px (transparent)")
    if args.audit_out:
        args.audit_out.parent.mkdir(parents=True, exist_ok=True)
        args.audit_out.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
