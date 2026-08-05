#!/usr/bin/env python3
"""Write an AEGIS ``properties.json`` (per-layer metadata + legend) for a tile layer.

AEGIS's admin layer importer (``loadSublayerPropertiesFromFile`` in
``src/components/admin/layerSublayerEdit.tsx``) fetches ``<layer>/properties.json``
and merges the allowed fields into the sublayer.  The file is validated against
``.local/schemas/sublayerImportable.json`` (``additionalProperties: false``), so this
script emits **only** the keys that schema permits:

    type, name, description, tilePattern, legend
        (boundingBox / minNativeZoom / maxNativeZoom / maxZoom / tileFormat are read
         by the admin straight from the layer's ``tilemapresource.xml`` — we do not
         duplicate them here.)

The ``legend`` is built from a GDAL ``color-relief`` ramp (the same ``.txt`` files the
``products`` step feeds to ``gdaldem``), so the legend always reflects the exact colour
treatment that was applied.  Ramp format reference:
    https://gdal.org/programs/gdaldem.html#cmdoption-arg-color_text_file

Ported from ``lunar_utils/aegis/properties.py`` — the ``ManagedPath`` /
``tiff_manager`` coupling is dropped in favour of plain CLI args.

Usage
-----
::

    cd GIS_data_conversion_pipeline

    # Slope (degrees) legend from the standard ramp
    pixi run python esri-to-aegis-lunar-southpole/properties/write_properties.py \\
        --processing slope --units deg \\
        --ramp esri-to-aegis-lunar-southpole/products/default_color_ramps/slope.txt \\
        --out <out>/Layers/slope/properties.json

    # Hillshade — no ramp, no legend
    pixi run python esri-to-aegis-lunar-southpole/properties/write_properties.py \\
        --processing hillshade --out <out>/Layers/hillshade/properties.json

    # Plain imagery layer (e.g. NAC) — name + description only
    pixi run python esri-to-aegis-lunar-southpole/properties/write_properties.py \\
        --processing nac --name nac --out <out>/Layers/nac/properties.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# Force UTF-8 stdout/stderr — avoids UnicodeEncodeError on default cp1252 terminals.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


# ---------------------------------------------------------------------------
# Per-processing defaults
# ---------------------------------------------------------------------------

DEFAULT_DESCRIPTIONS = {
    "hillshade": "Thematic map indicating shaded relief. There is no legend for a hillshade layer.",
    "aspect": "Thematic map indicating the azimuth that landscape slopes face. Values indicate 0 degrees (North), 90 degrees (East), 180 degrees (South), 270 (West).",
    "slope": "Thematic map indicating degrees of slope per pixel unit area. Derived from DEM.",
    "tri": "Thematic map showing Terrain Ruggedness Index (TRI) which measures the absolute elevation difference between a central pixel and its neighboring pixels. Units are in meters of elevation change per spatial resolution of the digital elevation model.",
    "viewshed": "Thematic map layer visualizing the field of view from a specific location, based on the landscape data in the raster digital elevation model (DEM).",
    "grid": "Grid structure derived from the Lunar Grid Reference System (LGRS) with grid sizes of 100 meter and 1 kilometer.",
    "nac": "Lunar Reconnaissance Orbiter Camera (LROC) Narrow Angle Camera (NAC) high resolution panchromatic imagery of the lunar surface.",
    "wac": "Lunar Reconnaissance Orbiter Camera (LROC) Wide Angle Camera (WAC) imagery at ~100 meters/pixel in seven colour bands.",
    "geounits": "Thematic map displaying colorized symbology for surface geologic units classified by changes in rock type and geologic structures.",
    "source": "Source imagery.",
}

# Sensible default legend units per processing type (overridable with --units).
DEFAULT_UNITS = {
    "slope": "deg",
    "aspect": "",
    "tri": "m",
}


# ---------------------------------------------------------------------------
# Colour ramp → legend  (ported from lunar_utils/aegis/properties.py)
# ---------------------------------------------------------------------------


def rgb_from_color(color: list[str]) -> str:
    """Format a GDAL colour spec (1/3/4 tokens, or hex / named) as CSS rgb()/rgba()."""
    if len(color) == 4:
        return f"rgba({color[0]}, {color[1]}, {color[2]}, {color[3]})"
    if len(color) == 3:
        return f"rgb({color[0]}, {color[1]}, {color[2]})"
    if len(color) != 1:
        raise ValueError(f"Unknown color: {color}")

    if color[0][0] == "#":
        hex_value = color[0][1:]
        return f"rgb{tuple(int(hex_value[i:i + 2], 16) for i in (0, 2, 4))}"

    color_map = {
        "white": "rgb(255, 255, 255)",
        "black": "rgb(0, 0, 0)",
        "red": "rgb(255, 0, 0)",
        "green": "rgb(0, 255, 0)",
        "blue": "rgb(0, 0, 255)",
        "yellow": "rgb(255, 255, 0)",
        "magenta": "rgb(255, 0, 255)",
        "cyan": "rgb(0, 255, 255)",
        "aqua": "rgb(0, 255, 255)",
        "gray": "rgb(128, 128, 128)",
        "grey": "rgb(128, 128, 128)",
        "orange": "rgb(255, 165, 0)",
        "brown": "rgb(150, 75, 0)",
        "purple": "rgb(160, 32, 240)",
        "violet": "rgb(160, 32, 240)",
        "indigo": "rgb(75, 0, 130)",
    }
    maybe = color[0].lower()
    if maybe in color_map:
        return color_map[maybe]
    raise ValueError(f"Unknown color: {maybe}")


def parse_line(line: str) -> tuple[str, str]:
    """Pull the (value, rgb) pair from a single colour-relief line."""
    separators = r"\s?:\s?|\s?,\s?|\s+"
    description, *color = re.split(separators, line)
    return description, rgb_from_color(color)


def get_ordinal_direction(lower_bound: float, upper_bound: float) -> str:
    """Return one of the 8 ordinal directions for a degree range (aspect legend)."""
    if not (0 <= lower_bound <= 360 and 0 <= upper_bound <= 360):
        raise ValueError(
            f"All bounds should be between 0 and 360: {(lower_bound, upper_bound)}"
        )

    # North wraps (lower > upper), so rotate by 22.5°, take the midpoint, rotate back.
    if lower_bound > upper_bound:
        rot = 22.5
        mid = (((upper_bound + rot) % 360 + (lower_bound + rot) % 360) / 2) - rot
    else:
        mid = (upper_bound + lower_bound) / 2

    # Snap to the nearest 45° sector: ramps mark bin edges with epsilon offsets
    # (e.g. 22.499/22.5), so midpoints land near — not exactly on — the sector centre.
    by_mid = {
        0: "N",
        45: "NE",
        90: "E",
        135: "SE",
        180: "S",
        225: "SW",
        270: "W",
        315: "NW",
    }
    snapped = round(mid / 45) * 45 % 360
    if abs(mid - round(mid / 45) * 45) <= 2:
        return by_mid[snapped]
    raise ValueError(
        f"Bad inputs for ordinal direction: {(lower_bound, upper_bound)}, midpoint={mid}"
    )


def fmt_bound(v: float) -> str:
    """Format a legend bound: 1 decimal when that's exact enough, else 2.

    The legacy 1-decimal rounding collapsed fine-grained ramps (the 1 m TRI ramp
    steps by 0.04 m) into degenerate bins like ``[0.0, 0.0)``.
    """
    return f"{v:.1f}" if round(v, 2) == round(v, 1) else f"{v:.2f}"


class LegendValue:
    """Helper for merging consecutive equal-colour rows into a single bin."""

    def __init__(self, value: str, color: str):
        # Tolerate comparison prefixes used by some kept ramps (comm_mask's ">0").
        self.value = float(value.lstrip("><="))
        self.color = color
        self.bounds = [self.value]

    def __eq__(self, other: object) -> bool:
        return isinstance(other, LegendValue) and self.color == other.color

    def merge(self, other: "LegendValue") -> None:
        self.bounds = self.bounds + other.bounds


def finalize_aspect(rows: list[LegendValue]) -> list[dict]:
    data: list[dict] = []
    n = len(rows)
    first_last_same = False
    for r, row in enumerate(rows):
        if r == 0 and rows[-1] == row:
            first_last_same = True
            rows[-1].merge(row)
            continue
        desc = (
            f"{get_ordinal_direction(row.bounds[0], row.bounds[-1])} "
            f"[{fmt_bound(row.bounds[0])}, {fmt_bound(row.bounds[-1])})"
        )
        if r == n - 1 and first_last_same:
            data.insert(0, {"color": row.color, "description": desc})
            continue
        data.append({"color": row.color, "description": desc})
    return data


def finalize(rows: list[LegendValue]) -> list[dict]:
    data: list[dict] = []
    n = len(rows)
    for r, row in enumerate(rows):
        desc = f"[{fmt_bound(row.bounds[0])}, {fmt_bound(row.bounds[-1])})"
        if r == n - 1:
            desc = f"≥ {fmt_bound(row.bounds[0])}"  # ≥ on the last bin
        data.append({"color": row.color, "description": desc})
    return data


def compactify_rows(rows: list[tuple[str, str]], processing: str) -> list[dict]:
    data: list[LegendValue] = []
    for description, color in rows:
        if description == "nv":  # skip the "no value" row
            continue
        row = LegendValue(value=description, color=color)
        if data and data[-1] == row:
            data[-1].merge(row)
            continue
        data.append(row)
    return finalize_aspect(data) if processing == "aspect" else finalize(data)


def color_ramp_to_legend(ramp_path: Path, processing: str, units_abbr: str) -> dict:
    """Build an AEGIS Legend ({legend[], unitsAbbr, version}) from a GDAL colour ramp."""
    rows: list[tuple[str, str]] = []
    for raw in ramp_path.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        rows.append(parse_line(stripped))
    return {
        "version": "2",
        "unitsAbbr": units_abbr,
        "legend": compactify_rows(rows, processing),
    }


# ---------------------------------------------------------------------------
# properties.json assembly
# ---------------------------------------------------------------------------


def build_properties(
    processing: str,
    name: str,
    ramp_path: Path | None,
    units_abbr: str | None,
    description: str | None,
) -> dict:
    """Assemble the schema-allowed properties.json dict for a raster tile-pyramid layer."""
    props: dict = {
        "type": "tile",
        "name": name,
        "description": description or DEFAULT_DESCRIPTIONS.get(processing, ""),
        "tilePattern": "{z}/{x}/{y}.png",
    }
    # Hillshade has no legend; an imagery layer (nac/wac/source) usually has none either.
    if ramp_path is not None:
        units = (
            units_abbr if units_abbr is not None else DEFAULT_UNITS.get(processing, "")
        )
        props["legend"] = color_ramp_to_legend(ramp_path, processing, units)
    return props


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--processing",
        required=True,
        choices=sorted(DEFAULT_DESCRIPTIONS.keys()),
        help="Layer kind — selects the default description (and legend units).",
    )
    p.add_argument(
        "--out", type=Path, required=True, help="Output properties.json path."
    )
    p.add_argument(
        "--ramp",
        type=Path,
        default=None,
        help="GDAL color-relief ramp .txt to build the legend from. Omit for hillshade / plain imagery.",
    )
    p.add_argument(
        "--name", default=None, help="Layer name (default: --processing value)."
    )
    p.add_argument(
        "--units",
        default=None,
        help="Legend units abbreviation (default per processing: slope=deg, tri=m).",
    )
    p.add_argument(
        "--description", default=None, help="Override the default description."
    )
    return p


def main() -> None:
    args = make_parser().parse_args()

    ramp_path: Path | None = args.ramp
    if ramp_path is not None:
        ramp_path = ramp_path.resolve()
        if not ramp_path.exists():
            print(f"ERROR: colour ramp not found: {ramp_path}", file=sys.stderr)
            sys.exit(1)

    props = build_properties(
        processing=args.processing,
        name=args.name or args.processing,
        ramp_path=ramp_path,
        units_abbr=args.units,
        description=args.description,
    )

    out: Path = args.out.resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(props, indent=2) + "\n", encoding="utf-8")

    n_legend = (
        len(props.get("legend", {}).get("legend", [])) if "legend" in props else 0
    )
    print(f"Wrote {out}")
    print(f"  type={props['type']}  name={props['name']}  legend items={n_legend}")


if __name__ == "__main__":
    main()
