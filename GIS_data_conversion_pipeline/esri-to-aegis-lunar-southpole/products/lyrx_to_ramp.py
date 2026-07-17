#!/usr/bin/env python3
"""Convert an ArcGIS ``.lyrx`` classified-raster symbology into a GDAL color-relief ramp.

The GIS team delivers product symbology (e.g. ``AMPES_Slope 1.lyrx``) as an ArcGIS Pro layer
file. This turns that ``CIMRasterClassifyColorizer`` into the same ``gdaldem color-relief``
``.txt`` ramp the pipeline already consumes (``products/default_color_ramps/*.txt``), so a
delivered symbology can be used **instead of** the built-in default ramp.

The emitted table uses **duplicate values at each class boundary** so gdaldem's linear
interpolation renders a flat colour across each bin (matching ArcGIS's classified rendering)
even on float rasters whose pixel values never match a table entry exactly — the same
technique as ``slope/colorize_slope.py``. The output uses the same ramp format as
``products/default_color_ramps/*.txt``, so it is consumed unchanged by
``properties/write_properties.py`` (which reads the ramp to build the AEGIS legend) and by
``products/dem_products.py`` (which feeds it to ``gdaldem color-relief``).

Usage
-----
::

    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/products/lyrx_to_ramp.py \\
        "F:/drop/A03MP026/AMPES_Slope 1.lyrx" -o slope_from_lyrx.txt

    # Non-slope symbology: set the first-class floor / last-class cap to suit the units
    pixi run python .../lyrx_to_ramp.py aspect.lyrx -o aspect.txt --floor 0 --cap 360

Stdlib-only (no GDAL/rasterio import) — safe to run under ``.venv`` as well as ``pixi``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# Slope symbology is in degrees: floor at 0°, cap the last class at 90°. Override for other
# products (e.g. aspect 0–360). These only set the first bin's lower anchor and the last bin's
# upper extent; intermediate boundaries come from the lyrx.
DEFAULT_FLOOR = 0.0
DEFAULT_CAP = 90.0
EPS = 0.001  # boundary epsilon; matches lyrx label notation ("2.001 – 4")


def parse_lyrx(lyrx_path: Path) -> list[tuple[float, int, int, int]]:
    """Return [(upper_bound, R, G, B), ...] sorted ascending from a .lyrx file.

    Reads the first ``CIMRasterClassifyColorizer`` and its ``CIMRasterClassBreak`` entries.
    Only ``CIMRGBColor`` class colours are supported (HSV colorRamp hints are ignored).
    """
    data = json.loads(lyrx_path.read_text(encoding="utf-8"))

    colorizer = None
    for layer in data.get("layerDefinitions", []):
        c = layer.get("colorizer", {})
        if c.get("type") == "CIMRasterClassifyColorizer":
            colorizer = c
            break
    if colorizer is None:
        raise ValueError(
            f"No CIMRasterClassifyColorizer found in {lyrx_path}. "
            "Is this a classified raster layer file?"
        )

    breaks: list[tuple[float, int, int, int]] = []
    for cb in colorizer.get("classBreaks", []):
        ub = float(cb["upperBound"])
        color = cb.get("color", {})
        if color.get("type") != "CIMRGBColor":
            raise ValueError(
                f"Class break at upperBound={ub} uses {color.get('type')!r} instead of "
                "CIMRGBColor. Only CIMRGBColor class breaks are supported."
            )
        vals = color["values"]  # [R, G, B, alpha_pct]
        breaks.append((ub, round(vals[0]), round(vals[1]), round(vals[2])))

    if not breaks:
        raise ValueError(f"No classBreaks found in colorizer in {lyrx_path}")
    breaks.sort(key=lambda x: x[0])
    return breaks


def build_color_table(
    breaks: list[tuple[float, int, int, int]],
    source_name: str,
    floor: float = DEFAULT_FLOOR,
    cap: float = DEFAULT_CAP,
) -> str:
    """Build a gdaldem color-relief table (flat colour per bin via duplicate boundaries)."""
    lines = [
        f"# gdaldem color-relief table — generated from {source_name}",
        "# Format: <value> <R> <G> <B> <A>   (nodata → transparent)",
        "nv 0 0 0 0",
    ]
    prev_ub: float | None = None
    for i, (ub, r, g, b) in enumerate(breaks):
        is_last = i == len(breaks) - 1
        if prev_ub is None:
            lines.append(f"{floor:.3f}  {r} {g} {b} 255")  # first class: floor → ub
            lines.append(f"{ub:.3f}  {r} {g} {b} 255")
        else:
            lines.append(f"{prev_ub + EPS:.3f}  {r} {g} {b} 255")  # prev_ub+eps → ub
            upper = max(cap, ub) if is_last else ub  # extend last class to the cap
            lines.append(f"{upper:.3f}  {r} {g} {b} 255")
        prev_ub = ub
    return "\n".join(lines) + "\n"


def lyrx_to_ramp(
    lyrx_path: Path,
    out_path: Path,
    floor: float = DEFAULT_FLOOR,
    cap: float = DEFAULT_CAP,
) -> Path:
    """Parse a .lyrx and write a gdaldem color-relief ramp .txt. Returns the output path."""
    breaks = parse_lyrx(lyrx_path)
    table = build_color_table(breaks, lyrx_path.name, floor=floor, cap=cap)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(table, encoding="utf-8")
    return out_path


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "lyrx", type=Path, help="ArcGIS .lyrx layer file (CIMRasterClassifyColorizer)."
    )
    p.add_argument(
        "-o",
        "--out",
        type=Path,
        required=True,
        help="Output gdaldem color-relief .txt.",
    )
    p.add_argument(
        "--floor",
        type=float,
        default=DEFAULT_FLOOR,
        help=f"First-class lower anchor (default: {DEFAULT_FLOOR}).",
    )
    p.add_argument(
        "--cap",
        type=float,
        default=DEFAULT_CAP,
        help=f"Last-class upper extent (default: {DEFAULT_CAP}).",
    )
    args = p.parse_args()

    lyrx = args.lyrx.resolve()
    if not lyrx.exists():
        print(f"ERROR: lyrx not found: {lyrx}", file=sys.stderr)
        sys.exit(1)

    breaks = parse_lyrx(lyrx)
    out = lyrx_to_ramp(lyrx, args.out.resolve(), floor=args.floor, cap=args.cap)
    print(
        f"Wrote {out}  ({len(breaks)} class breaks, floor={args.floor}, cap={args.cap})"
    )
    for ub, r, g, b in breaks:
        print(f"    ≤ {ub:>8.3f}  →  RGB({r:3d}, {g:3d}, {b:3d})")


if __name__ == "__main__":
    main()
