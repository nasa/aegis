"""Mosaic many overlapping single-band GeoTIFF frames into one raster (or VRT).

Designed for drops like the LROC NAC SfS orthoimage set (126 overlapping
``M<id>(LE|RE)-tile.5.2-map.tif`` frames) that must be merged into a single
seamless raster before they can be contrast-stretched (``stretch_to_8bit.py``)
and tiled (``raster_to_tiles.py``).

The default — and strongly preferred — output is a **GDAL VRT**: a tiny XML
file that virtually mosaics the frames with zero pixel duplication. The next
step in the pipeline (``stretch_to_8bit.py``) reads the VRT directly and emits
the 8-bit product in one pass, so there is no need to materialise a multi-GB
intermediate. Pass ``--materialize`` to write a real GeoTIFF instead.

NoData is honoured throughout: frames whose nodata is ``-3.4e38`` (the NAC
default) will not let their fill value swamp overlapping real pixels or the
later percentile stretch.

Prerequisites:
    - GDAL CLIs on PATH (gdalbuildvrt / gdal_translate). On this workstation
      that means running through pixi:  ``pixi run python mosaic_rasters.py ...``
      (see SITE_A03MP026 §4.2.1). Docker (aegis/gdal) is a fallback.

Usage:
    cd data_conversion_scripts

    # Preferred: build a VRT mosaic (no giant intermediate), exclude QA rasters
    pixi run python mosaic_rasters.py \\
        ../../aegis_static/A03MP026_SFS_1mpp_orthoimages \\
        ../../aegis_static/processed/A03MP026/nac_sfs_ortho_mosaic.vrt \\
        --glob "M*-map.tif" \\
        --nodata -3.4e38

    # Materialise a real GeoTIFF mosaic instead of a VRT
    pixi run python mosaic_rasters.py \\
        <in_dir> <out.tif> --glob "M*-map.tif" --nodata -3.4e38 \\
        --materialize --resampling average

Notes:
    - Output extension decides the default mode: ``.vrt`` → VRT, anything else
      → materialised GeoTIFF. ``--materialize`` / ``--vrt`` force the mode.
    - ``--exclude`` removes files by substring (default excludes ``mm2-`` QA
      rasters even when the glob would otherwise catch them).
    - CRS / transform / dtype of the source frames are preserved.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

# Windows consoles default to cp1252, which can't encode the Unicode used in
# help text / progress output (e.g. the → arrow). Force UTF-8 so the script
# works without the caller having to set PYTHONUTF8=1 first.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def make_parser(**kwargs) -> argparse.ArgumentParser:
    """ArgumentParser that accepts space-separated negative numbers in scientific
    notation (e.g. ``--nodata -3.4e38``).

    argparse's built-in negative-number detection only matches plain integers /
    decimals, so ``-3.4e38`` is mistaken for an option flag ("expected one
    argument"). Widening the matcher lets ``--nodata -3.4e38`` work naturally.
    """
    parser = argparse.ArgumentParser(**kwargs)
    parser._negative_number_matcher = re.compile(  # type: ignore[attr-defined]
        r"^-\d+$|^-\d*\.?\d+(?:[eE][-+]?\d+)?$"
    )
    return parser


def find_gdal_tool(*names: str) -> str | None:
    """Locate a GDAL CLI on PATH, trying both ``foo`` and ``foo.py`` names."""
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return None


def discover_frames(
    in_dir: Path,
    glob: str,
    exclude: list[str],
) -> list[Path]:
    """Find input frames by glob, dropping any whose name matches an exclude substring."""
    frames = sorted(p for p in in_dir.glob(glob) if p.is_file())
    if exclude:
        kept = []
        for p in frames:
            if any(substr in p.name for substr in exclude):
                continue
            kept.append(p)
        dropped = len(frames) - len(kept)
        if dropped:
            print(f"  Excluded {dropped} file(s) matching {exclude}")
        frames = kept
    return frames


def write_filelist(frames: list[Path], list_path: Path) -> None:
    """Write a newline-delimited file list for gdalbuildvrt -input_file_list."""
    list_path.write_text("\n".join(str(f.resolve()) for f in frames) + "\n")


def build_vrt(
    frames: list[Path],
    vrt_path: Path,
    nodata: float | None,
    resampling: str,
) -> None:
    """Build a GDAL VRT virtually mosaicking the frames (no pixel duplication)."""
    gdalbuildvrt = find_gdal_tool("gdalbuildvrt")
    if not gdalbuildvrt:
        print(
            "ERROR: gdalbuildvrt not found on PATH.\n"
            "Run via pixi (`pixi run python mosaic_rasters.py ...`) or the "
            "aegis/gdal Docker image (see SITE_A03MP026 §4.2.1).",
            file=sys.stderr,
        )
        sys.exit(1)

    vrt_path.parent.mkdir(parents=True, exist_ok=True)
    list_path = vrt_path.with_suffix(".inputs.txt")
    write_filelist(frames, list_path)

    cmd = [
        gdalbuildvrt,
        "-resolution",
        "highest",
        "-r",
        resampling,
        "-input_file_list",
        str(list_path),
    ]
    if nodata is not None:
        # srcnodata: treat this value as transparent in the inputs
        # vrtnodata: advertise the same nodata on the mosaic output
        cmd.extend(["-srcnodata", repr(nodata), "-vrtnodata", repr(nodata)])
    cmd.append(str(vrt_path))

    print("-" * 60)
    print("Building VRT mosaic")
    print("-" * 60)
    print(f"  Command: {' '.join(cmd)}")
    print()

    t0 = time.time()
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        print(f"\nERROR: gdalbuildvrt exited with {result.returncode}", file=sys.stderr)
        sys.exit(result.returncode)
    print(f"\n  VRT written in {time.time() - t0:.0f}s → {vrt_path}")
    print(f"  (input list kept at {list_path})")
    print()


def materialize_geotiff(
    vrt_path: Path,
    out_path: Path,
    nodata: float | None,
    compress: str,
    blocksize: int,
) -> None:
    """Materialise a real tiled GeoTIFF from the VRT via gdal_translate."""
    gdal_translate = find_gdal_tool("gdal_translate")
    if not gdal_translate:
        print(
            "ERROR: gdal_translate not found on PATH.\n"
            "Run via pixi (`pixi run python mosaic_rasters.py ...`) or the "
            "aegis/gdal Docker image (see SITE_A03MP026 §4.2.1).",
            file=sys.stderr,
        )
        sys.exit(1)

    cmd = [
        gdal_translate,
        "-of",
        "GTiff",
        "-co",
        "TILED=YES",
        "-co",
        f"BLOCKXSIZE={blocksize}",
        "-co",
        f"BLOCKYSIZE={blocksize}",
        "-co",
        f"COMPRESS={compress.upper()}",
        "-co",
        "BIGTIFF=YES",
        "-co",
        "NUM_THREADS=ALL_CPUS",
    ]
    if nodata is not None:
        cmd.extend(["-a_nodata", repr(nodata)])
    cmd.extend([str(vrt_path), str(out_path)])

    print("-" * 60)
    print("Materialising GeoTIFF mosaic")
    print("-" * 60)
    print(f"  Command: {' '.join(cmd)}")
    print()

    t0 = time.time()
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        print(
            f"\nERROR: gdal_translate exited with {result.returncode}", file=sys.stderr
        )
        sys.exit(result.returncode)

    size_gb = out_path.stat().st_size / (1024**3)
    print(
        f"\n  GeoTIFF written in {time.time() - t0:.0f}s → {out_path} ({size_gb:.2f} GB)"
    )
    print()


def main() -> None:
    parser = make_parser(
        description=(
            "Mosaic many overlapping GeoTIFF frames into one raster (or VRT),\n"
            "nodata-aware. Preferred output is a tiny VRT consumed directly by\n"
            "the stretch step — avoids writing a multi-GB intermediate."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  # VRT mosaic (preferred), exclude mm2-* QA rasters:\n"
            "  pixi run python mosaic_rasters.py in_dir/ out.vrt \\\n"
            "      --glob 'M*-map.tif' --nodata -3.4e38\n\n"
            "  # Materialised GeoTIFF mosaic:\n"
            "  pixi run python mosaic_rasters.py in_dir/ out.tif \\\n"
            "      --glob 'M*-map.tif' --nodata -3.4e38 --materialize\n"
        ),
    )
    parser.add_argument(
        "input_dir", type=Path, help="Directory containing input frames"
    )
    parser.add_argument(
        "output",
        type=Path,
        help="Output mosaic path. '.vrt' → VRT (default); other → GeoTIFF.",
    )
    parser.add_argument(
        "--glob",
        default="*.tif",
        help="Glob to select input frames (default: '*.tif')",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=None,
        help=(
            "Substring to exclude from matched files (repeatable). "
            "Defaults to excluding 'mm2-' QA rasters."
        ),
    )
    parser.add_argument(
        "--nodata",
        type=float,
        default=None,
        help="NoData value to honour on input and advertise on output (e.g. -3.4e38)",
    )
    parser.add_argument(
        "--resampling",
        default="average",
        choices=["nearest", "average", "bilinear", "cubic", "cubicspline", "lanczos"],
        help="Resampling for the VRT overview level (default: average)",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--vrt",
        action="store_true",
        help="Force VRT output (default when output ends in .vrt)",
    )
    mode.add_argument(
        "--materialize",
        action="store_true",
        help="Force a materialised GeoTIFF output instead of a VRT",
    )
    parser.add_argument(
        "--compress",
        default="lzw",
        choices=["lzw", "deflate", "zstd", "none"],
        help="Compression for materialised GeoTIFF (default: lzw)",
    )
    parser.add_argument(
        "--blocksize",
        type=int,
        default=512,
        help="Internal tile size for materialised GeoTIFF (default: 512)",
    )

    args = parser.parse_args()

    if not args.input_dir.is_dir():
        print(f"ERROR: input directory not found: {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    exclude = args.exclude if args.exclude is not None else ["mm2-"]

    print("=" * 60)
    print("Mosaic Rasters")
    print("=" * 60)
    print(f"  Input dir: {args.input_dir.resolve()}")
    print(f"  Glob:      {args.glob}")
    print(f"  Output:    {args.output.resolve()}")
    print()

    frames = discover_frames(args.input_dir, args.glob, exclude)
    if not frames:
        print(
            f"ERROR: no frames matched glob '{args.glob}' in {args.input_dir}",
            file=sys.stderr,
        )
        sys.exit(1)
    print(f"  Frames:    {len(frames)} matched")
    print()

    # Decide mode: explicit flags win, else infer from extension.
    want_vrt = args.vrt or (
        not args.materialize and args.output.suffix.lower() == ".vrt"
    )

    if want_vrt:
        vrt_path = args.output
        if vrt_path.suffix.lower() != ".vrt":
            vrt_path = vrt_path.with_suffix(".vrt")
            print(f"  (forcing .vrt extension → {vrt_path})")
        build_vrt(frames, vrt_path, args.nodata, args.resampling)
        print("Next: stretch the mosaic to 8-bit grayscale:")
        print(
            f"  pixi run python stretch_to_8bit.py {vrt_path} "
            f"{vrt_path.with_name(vrt_path.stem + '_8bit.tif')} "
            f"--pct-low 2 --pct-high 98"
        )
    else:
        # Build a temp VRT first, then materialise — fast and memory-light.
        tmp_vrt = args.output.with_suffix(".mosaic.tmp.vrt")
        build_vrt(frames, tmp_vrt, args.nodata, args.resampling)
        materialize_geotiff(
            tmp_vrt,
            args.output,
            args.nodata,
            args.compress,
            args.blocksize,
        )
        try:
            tmp_vrt.unlink()
            tmp_vrt.with_suffix(".inputs.txt").unlink(missing_ok=True)
        except OSError:
            pass
        print("Next: stretch the mosaic to 8-bit grayscale (stretch_to_8bit.py).")
    print()


if __name__ == "__main__":
    main()
