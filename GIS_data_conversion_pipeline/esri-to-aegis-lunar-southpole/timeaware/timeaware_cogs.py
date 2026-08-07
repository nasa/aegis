#!/usr/bin/env python3
"""Build one AEGIS time-aware layer from nested Cloud Optimized GeoTIFF frames.

The output is a single folder under ``Layers/``. Each source directory becomes a nested frame
directory, while ``manifest.json`` maps every timestamp to its ``.tif`` file. Explicit frame
bounds are written only when timestamp coverage is discontinuous, so unsupported observation
windows remain hidden.

Example:

    pixi run python esri-to-aegis-lunar-southpole/timeaware/timeaware_cogs.py \
        /drop/BlueOrigin_Illum /drop/SpaceX_Illum \
        --out /static/missionFiles/50/Layers/MS3_illumination \
        --datatype mazarico
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import rasterio

from time_manifest import add_bounds_for_gaps

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

ROOT = Path(__file__).resolve().parent.parent
GEOTIFF_TO_COG = ROOT / "common" / "geotiff_to_cog.py"
ILLUMINATION_TO_RGBA = ROOT / "timeaware" / "illumination_to_rgba.py"
PYTHON = sys.executable

MAZARICO_FMT = "%y%m%d%H%M%S"
QUICKMAP_FMT = "%m_%d_%Y_%H"
AEGIS_FMT = "%Y-%m-%dT%H:%M:%SZ"


@dataclass(frozen=True)
class Frame:
    source: Path
    group: str
    datetime: str


def parse_datetime(stem: str, datatype: str) -> str:
    """Extract a supported filename timestamp and return an AEGIS ISO-8601 value."""
    tokens = stem.split("_")
    if datatype == "mazarico":
        for token in tokens:
            if len(token) == 12 and token.isdigit():
                return datetime.strptime(token, MAZARICO_FMT).strftime(AEGIS_FMT)
        raise ValueError(
            f"No Mazarico datetime (12-digit YYMMDDHHMMSS) token found in {stem!r}."
        )

    for index in range(len(tokens) - 3):
        candidate = "_".join(tokens[index : index + 4])
        try:
            return datetime.strptime(candidate, QUICKMAP_FMT).strftime(AEGIS_FMT)
        except ValueError:
            continue
    raise ValueError(f"No QuickMap datetime (MM_DD_YYYY_HH) found in {stem!r}.")


def collect_frames(input_dirs: list[Path], datatype: str) -> list[Frame]:
    """Collect timestamped GeoTIFFs from each input directory."""
    frames: list[Frame] = []
    group_names: set[str] = set()
    for input_dir in input_dirs:
        if not input_dir.is_dir():
            raise ValueError(f"Input is not a directory: {input_dir}")
        if input_dir.name in group_names:
            raise ValueError(f"Input directory names must be unique: {input_dir.name}")
        group_names.add(input_dir.name)

        group_frames = [
            Frame(
                source=path,
                group=input_dir.name,
                datetime=parse_datetime(path.stem, datatype),
            )
            for path in sorted(input_dir.iterdir())
            if path.is_file() and path.suffix.lower() in {".tif", ".tiff"}
        ]
        if not group_frames:
            raise ValueError(f"No GeoTIFF frames found in {input_dir}")
        frames.extend(group_frames)

    duplicate_datetimes = {
        frame.datetime
        for frame in frames
        if sum(candidate.datetime == frame.datetime for candidate in frames) > 1
    }
    if duplicate_datetimes:
        values = ", ".join(sorted(duplicate_datetimes))
        raise ValueError(f"Frame timestamps must be unique; duplicates: {values}")
    return sorted(frames, key=lambda frame: frame.datetime)


def validate_shared_grid(frames: list[Frame]) -> None:
    """Ensure every frame can be swapped without a visible spatial jump."""
    reference: tuple[object, ...] | None = None
    reference_name = ""
    for frame in frames:
        with rasterio.open(frame.source) as src:
            grid = (
                src.width,
                src.height,
                src.count,
                str(src.crs),
                tuple(src.transform),
            )
        if reference is None:
            reference = grid
            reference_name = frame.source.name
        elif grid != reference:
            raise ValueError(
                f"{frame.source.name} does not share the raster grid of {reference_name}."
            )


def manifest_entries(frames: list[Frame]) -> list[dict[str, str]]:
    """Create source targets and add bounds only where timestamp coverage is discontinuous."""
    return add_bounds_for_gaps(
        [
            {
                "datetime": frame.datetime,
                "dirName": f"{frame.group}/{frame.source.stem}_cog.tif",
            }
            for frame in frames
        ]
    )


def build_layer(
    input_dirs: list[Path],
    out_dir: Path,
    datatype: str,
    name: str,
    description: str,
    overwrite: bool,
    illumination_alpha: bool,
    illumination_opacity: float,
) -> None:
    """Convert all frames to nested COGs and write their time-aware sidecars."""
    frames = collect_frames(input_dirs, datatype)
    validate_shared_grid(frames)

    if out_dir.exists():
        if not overwrite:
            raise FileExistsError(
                f"Output already exists: {out_dir} (pass --overwrite to rebuild)"
            )
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    with tempfile.TemporaryDirectory(prefix="aegis_timeaware_cogs_") as temporary_dir:
        scratch_dir = Path(temporary_dir)
        for index, frame in enumerate(frames, 1):
            destination = out_dir / frame.group / f"{frame.source.stem}_cog.tif"
            cog_input = frame.source
            if illumination_alpha:
                cog_input = scratch_dir / f"{index:04d}_illumination_rgba.tif"
                subprocess.run(
                    [
                        PYTHON,
                        str(ILLUMINATION_TO_RGBA),
                        str(frame.source),
                        str(cog_input),
                        "--opacity",
                        str(illumination_opacity),
                    ],
                    check=True,
                    env=env,
                )
            print(f"[{index}/{len(frames)}] {frame.source.name} -> {destination}")
            subprocess.run(
                [
                    PYTHON,
                    str(GEOTIFF_TO_COG),
                    str(cog_input),
                    "--compress",
                    "deflate",
                    "--output",
                    str(destination),
                ],
                check=True,
                env=env,
            )

    manifest = {
        "layer_name": name,
        "last_updated": datetime.now(timezone.utc).strftime(AEGIS_FMT),
        "time_layers": manifest_entries(frames),
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    (out_dir / "properties.json").write_text(
        json.dumps({"name": name, "description": description}, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {out_dir / 'manifest.json'} ({len(frames)} frames)")


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input_dirs",
        type=Path,
        nargs="+",
        help="One or more directories of timestamped GeoTIFF frames.",
    )
    parser.add_argument(
        "--out", required=True, type=Path, help="Output layer directory."
    )
    parser.add_argument(
        "--datatype",
        required=True,
        choices=["mazarico", "quickmap"],
        help="Filename datetime convention.",
    )
    parser.add_argument("--name", default=None, help="Layer display name.")
    parser.add_argument(
        "--description",
        default="Time-aware raster series rendered from Cloud Optimized GeoTIFF frames.",
        help="Layer description written to properties.json.",
    )
    parser.add_argument(
        "--overwrite", action="store_true", help="Replace an existing output layer."
    )
    parser.add_argument(
        "--illumination-alpha",
        action="store_true",
        help="Convert source illumination fractions into black RGBA pixels with inverse alpha.",
    )
    parser.add_argument(
        "--illumination-opacity",
        type=float,
        default=1.0,
        help="Multiplier for source-derived illumination alpha from 0 to 1 (default: 1).",
    )
    return parser


def main() -> None:
    args = make_parser().parse_args()
    if not 0 <= args.illumination_opacity <= 1:
        raise SystemExit("--illumination-opacity must be between 0 and 1")
    out_dir = args.out.resolve()
    build_layer(
        [path.resolve() for path in args.input_dirs],
        out_dir,
        args.datatype,
        args.name or out_dir.name,
        args.description,
        args.overwrite,
        args.illumination_alpha,
        args.illumination_opacity,
    )


if __name__ == "__main__":
    main()
