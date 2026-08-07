#!/usr/bin/env python3
"""Convert a single-band illumination fraction raster into a transparent RGBA shadow mask."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import rasterio

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def illumination_to_rgba(
    input_path: Path, output_path: Path, opacity: float
) -> None:
    """Write black RGBA pixels with alpha equal to one minus the illumination fraction."""
    with rasterio.open(input_path) as source:
        if source.count != 1:
            raise ValueError(f"Expected one illumination band, found {source.count}")

    gdaldem = shutil.which("gdaldem")
    if not gdaldem:
        raise RuntimeError("gdaldem was not found; run this converter through pixi")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    alpha = round(opacity * 255)
    color_table = "\n".join(
        [
            "# illumination_fraction red green blue alpha",
            "nv 0 0 0 0",
            f"0 0 0 0 {alpha}",
            "1 0 0 0 0",
            "",
        ]
    )
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        prefix="aegis_illumination_ramp_",
        delete=False,
        encoding="utf-8",
    ) as table_file:
        table_file.write(color_table)
        table_path = Path(table_file.name)
    try:
        subprocess.run(
            [
                gdaldem,
                "color-relief",
                str(input_path),
                str(table_path),
                str(output_path),
                "-alpha",
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
        table_path.unlink(missing_ok=True)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input", type=Path, help="Single-band illumination fraction GeoTIFF."
    )
    parser.add_argument("output", type=Path, help="Output RGBA GeoTIFF.")
    parser.add_argument(
        "--opacity",
        type=float,
        default=1.0,
        help="Multiplier for the source-derived alpha from 0 to 1 (default: 1).",
    )
    return parser


def main() -> None:
    args = make_parser().parse_args()
    if not args.input.is_file():
        raise SystemExit(f"Input GeoTIFF does not exist: {args.input}")
    if not 0 <= args.opacity <= 1:
        raise SystemExit("--opacity must be between 0 and 1")

    illumination_to_rgba(args.input, args.output, args.opacity)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
