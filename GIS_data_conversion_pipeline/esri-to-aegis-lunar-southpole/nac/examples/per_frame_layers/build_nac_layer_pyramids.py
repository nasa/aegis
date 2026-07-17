#!/usr/bin/env python3
"""PRESERVED EXAMPLE — build one AEGIS tile layer per NAC frame.

This is the test configuration that tiles EACH `M*-map.tif` frame into its own
AEGIS sublayer (100+ sublayers per mission). It is **not** the shipping path —
the production NAC process tiles a single GIS-provided mosaic into one layer (see
`nac/stretch_to_8bit.py` + `common/tile_to_cap_grid.py`, driven by `main.py`).
It is kept here only as a worked example of how per-frame layers could be built
if ever needed. See the README in this folder.

Each input `M*-map.tif` frame is stretched independently to 8-bit grayscale and
then tiled onto the shared lunar south-pole cap grid used by Leaflet production
(origin -931100, z0 units-per-pixel 12800). The output is one layer directory
per frame, named after the source stem, e.g. `M1409412744RE-tile.5.2-map`.

Run from `GIS_data_conversion_pipeline/` via pixi so GDAL CLIs are on PATH:

    pixi run python esri-to-aegis-lunar-southpole/nac/examples/per_frame_layers/build_nac_layer_pyramids.py \
        F:/_repos/aegis_static/MS3/A03MP026_SFS_1mpp_orthoimages \
        F:/_repos/aegis_static/<output-root>/Layers
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Use the same interpreter that is running this script so the uv venv is inherited.
PYTHON = sys.executable

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

DEFAULT_GLOB = "M*-map.tif"
DEFAULT_NODATA = "-3.4e38"
DEFAULT_PCT_LOW = "2"
DEFAULT_PCT_HIGH = "98"


def run(cmd: list[str | Path]) -> None:
    printable = " ".join(str(a) for a in cmd)
    print(f"\n$ {printable}")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    subprocess.run([str(a) for a in cmd], check=True, env=env)


def discover_frames(input_dir: Path, pattern: str) -> list[Path]:
    frames = sorted(
        p
        for p in input_dir.glob(pattern)
        if p.is_file() and not p.name.startswith("mm2-")
    )
    if not frames:
        print(
            f"ERROR: no NAC frames matched {pattern!r} in {input_dir}",
            file=sys.stderr,
        )
        sys.exit(1)
    return frames


def build_one_frame(
    frame: Path,
    output_layers: Path,
    stretch_script: Path,
    tile_script: Path,
    pct_low: str,
    pct_high: str,
    nodata: str,
    overwrite: bool,
    scratch_dir: Path,
) -> bool:
    """Returns True if the frame was processed, False if skipped."""
    layer_dir = output_layers / frame.stem
    tmr = layer_dir / "tilemapresource.xml"
    if layer_dir.exists() and tmr.exists() and not overwrite:
        print(f"\n[skip] {frame.name} -> {layer_dir} (already tiled)")
        return False

    if overwrite and layer_dir.exists():
        print(f"\n[overwrite] removing existing layer dir {layer_dir}")
        for child in sorted(layer_dir.rglob("*"), reverse=True):
            if child.is_file() or child.is_symlink():
                child.unlink()
            elif child.is_dir():
                child.rmdir()
        layer_dir.rmdir()

    layer_dir.parent.mkdir(parents=True, exist_ok=True)
    scratch_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"{frame.stem}_", dir=scratch_dir) as td:
        stretched = Path(td) / f"{frame.stem}_8bit.tif"
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        stretch_cmd = [
            str(PYTHON),
            str(stretch_script),
            str(frame),
            str(stretched),
            "--pct-low",
            pct_low,
            "--pct-high",
            pct_high,
            "--nodata",
            nodata,
        ]
        printable = " ".join(stretch_cmd)
        print(f"\n$ {printable}")
        result = subprocess.run(stretch_cmd, env=env)
        if result.returncode != 0:
            print(
                f"\n[warn] stretch failed for {frame.name} (likely all-nodata frame) — skipping",
                file=sys.stderr,
            )
            return False
        run([PYTHON, tile_script, stretched, layer_dir])
    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Stretch and tile each NAC frame into its own AEGIS layer pyramid.",
    )
    parser.add_argument(
        "input_dir", type=Path, help="Directory containing M*-map.tif NAC frames"
    )
    parser.add_argument(
        "output_layers", type=Path, help="Mission Layers output directory"
    )
    parser.add_argument(
        "--scratch",
        type=Path,
        default=None,
        help="Scratch directory for temporary stretched TIFs (default: <output_layers>/../scratch)",
    )
    parser.add_argument(
        "--glob", default=DEFAULT_GLOB, help=f"Input glob (default: {DEFAULT_GLOB})"
    )
    parser.add_argument(
        "--pct-low", default=DEFAULT_PCT_LOW, help="Low percentile cut (default: 2)"
    )
    parser.add_argument(
        "--pct-high", default=DEFAULT_PCT_HIGH, help="High percentile cut (default: 98)"
    )
    parser.add_argument(
        "--nodata", default=DEFAULT_NODATA, help="Input nodata value (default: -3.4e38)"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Rebuild layer folders even if tilemapresource.xml exists",
    )
    args = parser.parse_args()

    if not args.input_dir.exists():
        print(f"ERROR: input dir not found: {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    # This script lives at <root>/nac/examples/per_frame_layers/; reach the
    # production stretch + tile scripts at <root>/nac/ and <root>/common/.
    pipeline_root = Path(__file__).resolve().parents[3]
    stretch_script = pipeline_root / "nac" / "stretch_to_8bit.py"
    tile_script = pipeline_root / "common" / "tile_to_cap_grid.py"

    scratch_dir = (
        args.scratch if args.scratch else args.output_layers.parent / "scratch"
    )

    frames = discover_frames(args.input_dir, args.glob)
    print(f"Found {len(frames)} NAC frames in {args.input_dir}")
    print(f"Output Layers dir: {args.output_layers}")
    print(f"Scratch dir:       {scratch_dir}")

    skipped_nodata = []
    for idx, frame in enumerate(frames, start=1):
        print("\n" + "=" * 72)
        print(f"[{idx}/{len(frames)}] {frame.name}")
        print("=" * 72)
        ok = build_one_frame(
            frame,
            args.output_layers,
            stretch_script,
            tile_script,
            args.pct_low,
            args.pct_high,
            args.nodata,
            args.overwrite,
            scratch_dir,
        )
        if (
            not ok
            and not (args.output_layers / frame.stem / "tilemapresource.xml").exists()
        ):
            skipped_nodata.append(frame.name)

    # Clean up scratch dir if empty
    try:
        scratch_dir.rmdir()
    except OSError:
        pass

    print("\nDone. One layer pyramid was produced per NAC frame.")
    if skipped_nodata:
        print(f"\n[warn] {len(skipped_nodata)} frame(s) skipped (no valid pixels):")
        for name in skipped_nodata:
            print(f"  {name}")


if __name__ == "__main__":
    main()
