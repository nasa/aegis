"""Colorize a float32 slope raster using an ArcGIS .lyrx colour standard.

The delivered data drop for A03MP026 (Mons Mouton Plateau) included the slope
raster as a plain float32 GeoTIFF (degrees). ``gdal2tiles`` refuses to tile
float32 data directly. Before tiling, the raster must be converted to an 8-bit
RGBA image using the project's standard slope colour ramp.

This legacy delivered-raster path either parses an ArcGIS Pro ``.lyrx`` file or
uses an existing GDAL color-relief ramp, then produces a single 8-bit RGBA
GeoTIFF ready for ``raster_to_tiles.py``. No palette values are hardcoded here.

Provenance note
---------------
The data drop did **not** include this symbology. The ``.lyrx`` was obtained
separately from the GIS team on 2026-06-16. See §9.5 Step 7 in
``SITE_A03MP026-MONS-MOUTON-PLATEAU.md`` for the full provenance trail.

Usage
-----
::

    cd GIS_data_conversion_pipeline

    # Minimal — auto-detect lyrx next to the input raster
    pixi run python esri-to-aegis-lunar-southpole/slope/colorize_slope.py \\
        /path/to/SiteUD1_final_adj_5mpp_slp.tif \\
        /path/to/output/slope_colorized.tif

    # Explicit lyrx path
    pixi run python esri-to-aegis-lunar-southpole/slope/colorize_slope.py \\
        /path/to/SiteUD1_final_adj_5mpp_slp.tif \\
        /path/to/output/slope_colorized.tif \\
        --lyrx "/path/to/AMPES_Slope 1.lyrx"

Requirements
------------
``gdaldem`` must be on PATH (provided by ``pixi run`` via the conda-forge GDAL
binary; do **not** need a system GDAL install).
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Force UTF-8 stdout/stderr — avoids UnicodeEncodeError on default cp1252 terminals.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


# ---------------------------------------------------------------------------
# .lyrx parsing
# ---------------------------------------------------------------------------


def _parse_lyrx(lyrx_path: Path) -> list[tuple[float, int, int, int]]:
    """Return a list of (upper_bound_degrees, R, G, B) from a .lyrx file.

    Reads the first ``CIMRasterClassifyColorizer`` found in the layer
    definitions and extracts each ``CIMRasterClassBreak`` entry.  Only
    ``CIMRGBColor`` values are handled; ``CIMHSVColor`` entries in the
    ``colorRamp`` section are ignored (those are interpolation hints, not the
    class colours).

    Returns entries sorted by upper_bound ascending.
    """
    data = json.loads(lyrx_path.read_text(encoding="utf-8"))

    layer_defs = data.get("layerDefinitions", [])
    colorizer = None
    for layer in layer_defs:
        c = layer.get("colorizer", {})
        if c.get("type") == "CIMRasterClassifyColorizer":
            colorizer = c
            break

    if colorizer is None:
        raise ValueError(
            f"No CIMRasterClassifyColorizer found in {lyrx_path}. "
            "Check that this is a classified raster layer file."
        )

    breaks: list[tuple[float, int, int, int]] = []
    for cb in colorizer.get("classBreaks", []):
        ub = float(cb["upperBound"])
        color = cb.get("color", {})
        if color.get("type") != "CIMRGBColor":
            raise ValueError(
                f"Class break at upperBound={ub} uses {color.get('type')!r} "
                "instead of CIMRGBColor. Only CIMRGBColor class breaks are "
                "supported."
            )
        vals = color["values"]  # [R, G, B, alpha_pct]
        r, g, b = round(vals[0]), round(vals[1]), round(vals[2])
        breaks.append((ub, r, g, b))

    if not breaks:
        raise ValueError(f"No classBreaks found in colorizer in {lyrx_path}")

    breaks.sort(key=lambda x: x[0])
    return breaks


def _build_color_table(
    breaks: list[tuple[float, int, int, int]],
) -> str:
    """Build a ``gdaldem color-relief`` colour table string.

    The table uses **duplicate values at each class boundary** so that gdaldem's
    linear interpolation produces a flat colour across each bin, matching
    ArcGIS's classified rendering without using ``-exact_color_entry`` (which
    would fail on float32 input because pixel values never match table entries
    exactly).  Strategy:

    * nodata (``nv``) → fully transparent.
    * For the first class: anchor both at ``0`` and at the upper bound.
    * For each subsequent class: place one anchor at ``prev_ub + epsilon``
      (so the colour switches immediately above the boundary) and one at the
      current upper bound.
    * For the last (cap) class: extend to ``90`` (covers any plausible slope).

    The ``epsilon`` step (0.001°) matches the ``.lyrx`` label notation
    (e.g. "2.001 – 4"), so the class boundary is visually identical to ArcGIS.
    """
    lines = [
        "# gdaldem color-relief table generated from the supplied .lyrx",
        "# Format: <value> <R> <G> <B> <A>",
        "# nodata → transparent",
        "nv 0 0 0 0",
    ]

    EPS = 0.001  # matches lyrx label "2.001", "4.001", etc.
    prev_ub: float | None = None

    for i, (ub, r, g, b) in enumerate(breaks):
        is_last = i == len(breaks) - 1

        if prev_ub is None:
            # First class: 0 → ub
            lines.append(f"0     {r} {g} {b} 255")
            lines.append(f"{ub:.3f}  {r} {g} {b} 255")
        else:
            # Subsequent class: prev_ub+eps → ub
            lo = prev_ub + EPS
            lines.append(f"{lo:.3f}  {r} {g} {b} 255")
            if is_last:
                # Cap: extend to cover the full data range
                lines.append(f"90    {r} {g} {b} 255")
            else:
                lines.append(f"{ub:.3f}  {r} {g} {b} 255")

        prev_ub = ub

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# gdaldem execution
# ---------------------------------------------------------------------------


def _find_gdaldem() -> str:
    path = shutil.which("gdaldem")
    if not path:
        print(
            "ERROR: gdaldem not found on PATH.\n"
            "Run this script with 'pixi run' so the conda-forge GDAL binaries\n"
            "are on PATH, or install GDAL system-wide.",
            file=sys.stderr,
        )
        sys.exit(1)
    return path


def _find_lyrx_next_to(raster: Path) -> Path | None:
    """Look for a .lyrx file in the same directory as the raster."""
    for f in raster.parent.iterdir():
        if f.suffix.lower() == ".lyrx":
            return f
    return None


def colorize(
    input_path: Path,
    output_path: Path,
    *,
    lyrx_path: Path | None = None,
    ramp_path: Path | None = None,
) -> None:
    """Resolve a colour table and run gdaldem color-relief."""

    if (lyrx_path is None) == (ramp_path is None):
        raise ValueError("Exactly one of lyrx_path or ramp_path is required")

    print("=" * 60)
    print("Slope raster → 8-bit RGBA (lyrx colorize)")
    print("=" * 60)
    print(f"  Input:  {input_path.resolve()}")
    print(f"  Output: {output_path.resolve()}")
    if lyrx_path is not None:
        print(f"  lyrx:   {lyrx_path.resolve()}")
    else:
        print(f"  ramp:   {ramp_path.resolve()}")
    print()

    tmp_path: Path | None = None
    color_table_path = ramp_path
    if lyrx_path is not None:
        print("Parsing .lyrx … ", end="", flush=True)
        breaks = _parse_lyrx(lyrx_path)
        print(f"{len(breaks)} class breaks found")
        for ub, r, g, b in breaks:
            print(f"    ≤ {ub:>8.3f}°  →  RGB({r:3d}, {g:3d}, {b:3d})")
        print()

        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".txt",
            prefix="aegis_slope_ramp_",
            delete=False,
            encoding="utf-8",
        ) as tmp:
            tmp.write(_build_color_table(breaks))
            tmp_path = Path(tmp.name)
            color_table_path = tmp_path

    assert color_table_path is not None

    try:
        gdaldem = _find_gdaldem()
        output_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            gdaldem,
            "color-relief",
            str(input_path),
            str(color_table_path),
            str(output_path),
            "-alpha",  # add alpha channel → RGBA (nodata = transparent)
            # NOTE: do NOT use -exact_color_entry here. The slope raster is
            # float32 so pixel values (e.g. 8.472°) never match a table entry
            # exactly, producing an all-zero (blank) output. Instead the colour
            # table uses duplicate boundary values at bin edges (e.g. "2.000"
            # and "2.001") so gdaldem's linear interpolation snaps to a flat
            # colour across each 2° bin — visually identical to ArcGIS's
            # classified rendering.
            "-of",
            "GTiff",
            "-co",
            "TILED=YES",
            "-co",
            "COMPRESS=DEFLATE",
            "-co",
            "BIGTIFF=IF_SAFER",  # RGBA output of a large slope raster can exceed 4 GB
        ]

        print("-" * 60)
        print("Running gdaldem color-relief")
        print("-" * 60)
        print(f"  Command: {' '.join(cmd)}")
        print()

        result = subprocess.run(cmd)
        if result.returncode != 0:
            print(
                f"\nERROR: gdaldem exited with code {result.returncode}",
                file=sys.stderr,
            )
            sys.exit(result.returncode)

    finally:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)

    print(f"\n  Output written: {output_path.resolve()}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "input",
        type=Path,
        help="Float32 slope raster in degrees (e.g. SiteUD1_final_adj_5mpp_slp.tif)",
    )
    p.add_argument(
        "output",
        type=Path,
        help="Output 8-bit RGBA GeoTIFF (suitable for raster_to_tiles.py)",
    )
    source = p.add_mutually_exclusive_group()
    source.add_argument(
        "--lyrx",
        type=Path,
        default=None,
        help=(
            "Path to the ArcGIS .lyrx layer file containing the "
            "CIMRasterClassifyColorizer colour ramp. "
            "If omitted, the script looks for any .lyrx file in the same "
            "directory as the input raster."
        ),
    )
    source.add_argument(
        "--ramp",
        type=Path,
        default=None,
        help="Existing GDAL color-relief ramp. Takes the place of .lyrx conversion.",
    )
    return p


def main() -> None:
    args = make_parser().parse_args()

    input_path: Path = args.input.resolve()
    if not input_path.exists():
        print(f"ERROR: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    ramp_path: Path | None = args.ramp
    if ramp_path is not None:
        ramp_path = ramp_path.resolve()
        if not ramp_path.exists():
            print(f"ERROR: ramp file not found: {ramp_path}", file=sys.stderr)
            sys.exit(1)

    lyrx_path: Path | None = args.lyrx
    if lyrx_path is None and ramp_path is None:
        lyrx_path = _find_lyrx_next_to(input_path)
        if lyrx_path is None:
            print(
                f"ERROR: no .lyrx file found next to {input_path}.\n"
                "Pass --lyrx /path/to/file.lyrx explicitly.",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"  Auto-detected lyrx: {lyrx_path}")
    elif lyrx_path is not None:
        lyrx_path = lyrx_path.resolve()
        if not lyrx_path.exists():
            print(f"ERROR: lyrx file not found: {lyrx_path}", file=sys.stderr)
            sys.exit(1)

    colorize(
        input_path=input_path,
        output_path=args.output.resolve(),
        lyrx_path=lyrx_path,
        ramp_path=ramp_path,
    )


if __name__ == "__main__":
    main()
