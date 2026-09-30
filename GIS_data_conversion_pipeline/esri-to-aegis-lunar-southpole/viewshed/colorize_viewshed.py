#!/usr/bin/env python3
"""Convert a classified viewshed GeoTIFF into an RGBA raster."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

COMMON = Path(__file__).resolve().parents[1] / "common"
sys.path.insert(0, str(COMMON))

from colorize_classified_mask import colorize_classified_mask, parse_hex_color

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


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

    colorize_classified_mask(
        args.input,
        args.output,
        (args.visible_value,),
        args.nonvisible_value,
        args.nodata_value,
        args.fill_color,
        args.fill_opacity,
        require_fill_value=True,
    )


if __name__ == "__main__":
    main()
