#!/usr/bin/env python3
"""Tile a directory of single-band time-series rasters and emit an AEGIS ``manifest.json``.

For time-aware layers (e.g. illumination over a lunar day), AEGIS reads a ``manifest.json``
at the layer root (``loadManifestFromFile`` in ``src/components/admin/layerSublayerEdit.tsx``)
shaped as::

    { "time_layers": [ { "datetime": "<ISO-8601>", "dirName": "<tile folder>" }, ... ] }

and expects each ``dirName`` to be a sibling tile pyramid (``{z}/{x}/{y}.png``), plus one
``tilemapresource.xml`` at the layer root.  AEGIS derives the per-frame time *ranges* itself
(midpoints between adjacent frames), so the manifest only needs ``datetime`` + ``dirName``.

    <out>/<indir.stem>_singleband_time-aware_data/
        manifest.json
        tilemapresource.xml
        <frame-1-stem>/ {z}/{x}/{y}.png
        <frame-2-stem>/ {z}/{x}/{y}.png
        ...

Note: AEGIS currently allows **one** time-based sublayer per mission (enforced in
``layerSublayerEdit.tsx``).

Ported from ``lunar_utils/aegis/timeaware/singleband_timeaware_raster.py`` (folding in
``timemanifest.py``).  Changes vs legacy:

* tiling reuses ``common/tile_to_cap_grid.py`` (pure rasterio, cap grid) instead of the
  vendored ``gdal2customtiles``;
* the single-band check uses rasterio instead of ``osgeo``;
* the fragile datetime parsing (``str(dt).split("_"[:3])[4]``) is replaced with a robust
  token scan for the two known formats.

Usage
-----
::

    cd data_conversion_scripts
    pixi run python esri-to-aegis-lunar-southpole/timeaware/singleband_timeaware.py \\
        /path/to/illum_frames --datatype mazarico --out /path/to/output
    # manifest only (skip tiling):
    pixi run python esri-to-aegis-lunar-southpole/timeaware/singleband_timeaware.py \\
        /path/to/illum_frames --datatype quickmap --no-tile
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parent.parent  # pipeline root (esri-to-aegis-lunar-southpole)
TILE_TO_CAP_GRID = ROOT / "common" / "tile_to_cap_grid.py"
PYTHON = sys.executable

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

MAZARICO_FMT = "%y%m%d%H%M%S"  # 12 contiguous digits, e.g. 271108230000
QUICKMAP_FMT = "%m_%d_%Y_%H"  # 4 underscore-joined tokens, e.g. 11_08_2027_23
AEGIS_FMT = "%Y-%m-%dT%H:%M:%SZ"  # ISO 8601


def parse_datetime(stem: str, datatype: str) -> str:
    """Extract a datetime from a filename stem and return it in AEGIS ISO-8601 form.

    Robust to extra prefix/suffix tokens: scans underscore-separated tokens for the first
    that parses with the selected format (Mazarico = one 12-digit token; QuickMap = a
    sliding window of 4 tokens). Raises a clear error if nothing matches.
    """
    tokens = stem.split("_")
    dt = datatype.lower()

    if dt == "mazarico":
        for tok in tokens:
            if len(tok) == 12 and tok.isdigit():
                return datetime.strptime(tok, MAZARICO_FMT).strftime(AEGIS_FMT)
        raise ValueError(
            f"No Mazarico datetime (12-digit YYMMDDHHMMSS) token found in {stem!r}."
        )

    if dt == "quickmap":
        for i in range(len(tokens) - 3):
            candidate = "_".join(tokens[i : i + 4])
            try:
                return datetime.strptime(candidate, QUICKMAP_FMT).strftime(AEGIS_FMT)
            except ValueError:
                continue
        raise ValueError(
            f"No QuickMap datetime (MM_DD_YYYY_HH) found in {stem!r}."
        )

    raise ValueError(f"Unknown datatype {datatype!r}; expected 'mazarico' or 'quickmap'.")


def collect_single_band_tifs(indir: Path) -> list[Path]:
    """Return .tif files in indir that have exactly one raster band (sorted by name)."""
    tifs: list[Path] = []
    for f in sorted(indir.iterdir()):
        if f.suffix.lower() != ".tif":
            continue
        with rasterio.open(f) as src:
            if src.count == 1:
                tifs.append(f)
            else:
                print(f"  [skip] {f.name}: {src.count} bands (expected single-band)")
    return tifs


def to_8bit_if_needed(src_path: Path, scratch: Path) -> tuple[Path, bool]:
    """Return a uint8 raster path. If src is already uint8, return it unchanged.

    Otherwise linearly scale finite, non-nodata values into 1..255 (0 reserved as
    transparent nodata) and write a temp GeoTIFF. Per-frame min/max — see README for the
    cross-frame-comparability caveat.
    """
    with rasterio.open(src_path) as src:
        if src.dtypes[0] == "uint8":
            return src_path, False

        band = src.read(1).astype("float64")
        nodata = src.nodata
        mask = np.isfinite(band)
        if nodata is not None:
            mask &= band != nodata
        if not mask.any():
            raise ValueError(f"{src_path.name}: no valid pixels to scale.")

        lo, hi = float(band[mask].min()), float(band[mask].max())
        scaled = np.zeros(band.shape, dtype="uint8")
        if hi > lo:
            norm = (band[mask] - lo) / (hi - lo)
            scaled[mask] = np.clip(np.round(1 + norm * 254), 1, 255).astype("uint8")
        else:
            scaled[mask] = 255

        profile = src.profile
        profile.update(dtype="uint8", count=1, nodata=0, compress="deflate", tiled=True)
        out = scratch / f"{src_path.stem}_8bit.tif"
        with rasterio.open(out, "w", **profile) as dst:
            dst.write(scaled, 1)
        return out, True


def tile_frame(tif: Path, out_dir: Path, scratch: Path) -> None:
    """Convert to 8-bit if needed and tile to the cap grid into out_dir."""
    src8, is_temp = to_8bit_if_needed(tif, scratch)
    try:
        env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
        subprocess.run(
            [PYTHON, str(TILE_TO_CAP_GRID), str(src8), str(out_dir)], check=True, env=env
        )
    finally:
        if is_temp:
            src8.unlink(missing_ok=True)


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("indir", type=Path, help="Directory of single-band time-series .tif files.")
    p.add_argument(
        "--datatype",
        required=True,
        choices=["mazarico", "quickmap"],
        help="Filename datetime convention.",
    )
    p.add_argument(
        "-o", "--outdir", type=Path, default=None,
        help="Output root (default: alongside indir). The layer folder is created inside it.",
    )
    p.add_argument(
        "-nt", "--no-tile", action="store_true",
        help="Only (re)write manifest.json; skip tiling.",
    )
    return p


def main() -> None:
    args = make_parser().parse_args()
    indir: Path = args.indir.resolve()
    if not indir.is_dir():
        print(f"ERROR: not a directory: {indir}", file=sys.stderr)
        sys.exit(1)

    out_root = (args.outdir or indir.parent).resolve()
    layer_name = f"{indir.stem}_singleband_time-aware_data"
    layer_dir = out_root / layer_name
    layer_dir.mkdir(parents=True, exist_ok=True)

    tifs = collect_single_band_tifs(indir)
    if not tifs:
        print(f"ERROR: no single-band .tif files in {indir}", file=sys.stderr)
        sys.exit(1)
    print(f"Found {len(tifs)} single-band rasters.")

    time_layers = [
        {"dirName": tif.stem, "datetime": parse_datetime(tif.stem, args.datatype)}
        for tif in tifs
    ]
    time_layers.sort(key=lambda x: x["datetime"])

    if not args.no_tile:
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            for idx, tif in enumerate(tifs, 1):
                print(f"\n[{idx}/{len(tifs)}] tiling {tif.name}")
                tile_frame(tif, layer_dir / tif.stem, scratch)
        # Lift one tilemapresource.xml up to the layer root (all frames share the cap grid).
        for frame in time_layers:
            tmr = layer_dir / frame["dirName"] / "tilemapresource.xml"
            if tmr.exists():
                shutil.copy(tmr, layer_dir / "tilemapresource.xml")
                break

    manifest = {
        "layer_name": layer_name,
        "last_updated": datetime.now().strftime(AEGIS_FMT),
        "time_layers": time_layers,
    }
    (layer_dir / "manifest.json").write_text(json.dumps(manifest, indent=4) + "\n", encoding="utf-8")

    print(f"\nWrote {layer_dir / 'manifest.json'}  ({len(time_layers)} time layers)")
    print(f"Layer dir: {layer_dir}")


if __name__ == "__main__":
    main()
