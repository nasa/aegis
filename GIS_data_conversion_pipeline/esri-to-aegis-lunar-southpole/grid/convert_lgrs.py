#!/usr/bin/env python3
"""Convert a raw ESRI/ArcGIS LGRS GeoJSON into an AEGIS mission-grid GeoJSON.

The AEGIS mission-grid admin (``src/components/admin/gridUpload.tsx``) ingests a
GeoJSON ``FeatureCollection`` with ``row_total`` / ``column_total`` at the top level and
one **Point** feature per grid cell carrying ``id, LGRS_ACC, L_coord, R_coord, row,
column``.  This script turns the "raw" grid export into exactly that shape.

Source data (answers "what is the input?")
-------------------------------------------
A ``.geojson`` of a **Lunar Grid Reference System (LGRS)** exported from ESRI/ArcGIS with
"Output as WGS84".  It provides:

* one **Polygon** (or line) feature per grid-cell edge, with index-0 = the cell's
  bottom-left corner (the label anchor AEGIS uses);
* a full-length ``LGRS_ACC`` attribute per feature (column may be named ``LGRS``,
  ``LGRS_ACC`` or ``ACC``);
* a centre-Y attribute in metres (``centY`` or ``cent_Y_LPS``) used to detect row changes
  (it steps by the grid interval — e.g. 100 m — each new row).

AEGIS output contract
---------------------
* ``LGRS_ACC`` truncated to its last four chars, split into ``L_coord`` / ``R_coord``
  (100 m grids are 6-char → e.g. "M9"/"Q9"; 1 km grids are 5-char → "L"/"J");
* a blank ``L_coord``/``R_coord`` on the last point before a new row (AEGIS requirement);
* ``row_total`` / ``column_total`` = max index + 1 (AEGIS indexing).

Improvement over the legacy ``lunar_utils/aegis/grid/convert_lgrs.py``: this port uses the
**standard library only** (no ``geopandas``/``tqdm``).  The input is already WGS84 GeoJSON
and the output is GeoJSON, so no reprojection or heavy geo stack is needed.  (The legacy
``--shp`` shapefile output — whose only user was geopandas — is dropped.)

Usage
-----
::

    pixi run python esri-to-aegis-lunar-southpole/grid/convert_lgrs.py raw_grid.geojson
    pixi run python esri-to-aegis-lunar-southpole/grid/convert_lgrs.py raw_grid.geojson -o out_dir
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

# Known raw-input column names (first match wins).
LGRS_COLUMNS = ("LGRS_ACC", "LGRS", "ACC")
DIST_COLUMNS = ("centY", "cent_Y_LPS")

# WGS84 CRS member used when the raw file doesn't carry one (GeoJSON RFC 7946 default).
DEFAULT_CRS = {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}}


def detect_columns(props: dict) -> tuple[str, str]:
    """Pick the LGRS and centre-Y property names actually present in the features."""
    lgrs = next((c for c in LGRS_COLUMNS if c in props), None)
    dist = next((c for c in DIST_COLUMNS if c in props), None)
    if lgrs is None:
        raise ValueError(f"No LGRS column found (looked for {LGRS_COLUMNS}). Keys: {list(props)}")
    if dist is None:
        raise ValueError(f"No centre-Y column found (looked for {DIST_COLUMNS}). Keys: {list(props)}")
    return lgrs, dist


def bottom_left_coord(geometry: dict) -> list[float]:
    """Return the index-0 vertex ([lon, lat]) — the grid cell's bottom-left anchor."""
    gtype = geometry["type"]
    coords = geometry["coordinates"]
    if gtype == "Polygon":
        return list(coords[0][0])  # exterior ring, first vertex
    if gtype == "LineString":
        return list(coords[0])
    if gtype == "MultiLineString":
        return list(coords[0][0])
    if gtype == "Point":
        return list(coords)
    raise ValueError(f"Unsupported geometry type for a grid cell: {gtype!r}")


def row_and_column_counter(
    dist: list[float], i: int, row: int, column: int
) -> tuple[int, int, bool]:
    """Track row/column by watching the centre-Y value step between features.

    Faithful port of the legacy logic: a new row begins when the centre-Y value rises;
    the last point before a rise gets a blank LGRS (``empty_lgrs``).
    """
    n = len(dist)
    empty_lgrs = False
    current = dist[i]
    next_val = dist[i + 1] if i < n - 1 else None

    if i == 0:
        return 0, 0, False

    last = dist[i - 1]
    if i == n - 1:
        # Final feature: no next; close out the last row/column from the previous value.
        if current > last:
            row += 1
            column = 0
        else:  # current <= last
            column += 1
        return row, column, False

    # Interior feature.
    if next_val is not None and current < next_val:
        empty_lgrs = True
    if current > last:
        row += 1
        column = 0
    else:
        column += 1
    return row, column, empty_lgrs


def split_lgrs_coordinate(
    lgrs_acc: str, l_coord: str, r_coord: str, empty_lgrs: bool
) -> tuple[str, str, str]:
    """Use pre-split L/R coords supplied by the generator (``generate_lgrs.py``).

    The generator already derives ``L_coord``/``R_coord`` from the ACC condensed string, so
    we just apply the AEGIS blank-before-new-row rule and keep the full ``LGRS_ACC``.
    """
    if empty_lgrs:
        return lgrs_acc, " ", " "
    return lgrs_acc, l_coord, r_coord


def clean_lgrs_coordinate(lgrs_acc: str, empty_lgrs: bool) -> tuple[str, str, str]:
    """Truncate the LGRS string into (full, L_coord, R_coord) per AEGIS rules.

    Legacy path for the raw ESRI/ArcGIS export, whose ``LGRS_ACC`` is not pre-split.
    """
    if empty_lgrs:
        # AEGIS wants a blank L/R on the last point before a new row; keep full ACC.
        return lgrs_acc, " ", " "

    n = len(lgrs_acc)
    if n == 6:  # 100 m interval → keep last 4 chars, split 2 + 2
        return lgrs_acc, lgrs_acc[3:5], lgrs_acc[5:]
    if n == 5:  # 1 km interval → keep last 2 chars, split 1 + 1
        return lgrs_acc, lgrs_acc[3:4], lgrs_acc[4:]
    raise ValueError(
        f"Unexpected LGRS length {n} for {lgrs_acc!r}; expected 5 (1 km) or 6 (100 m)."
    )


def convert(raw: dict, name: str) -> dict:
    """Build the AEGIS mission-grid FeatureCollection from a raw LGRS GeoJSON dict."""
    features = raw.get("features", [])
    if not features:
        raise ValueError("Input GeoJSON has no features.")

    lgrs_col, dist_col = detect_columns(features[0]["properties"])
    dist = [float(f["properties"][dist_col]) for f in features]

    # Features from generate_lgrs.py carry pre-split L_coord/R_coord; the raw ESRI export
    # does not (we truncate its LGRS_ACC instead).
    presplit = "L_coord" in features[0]["properties"] and "R_coord" in features[0]["properties"]

    out_features: list[dict] = []
    row = column = 0
    for i, feat in enumerate(features):
        props = feat["properties"]
        row, column, empty_lgrs = row_and_column_counter(dist, i, row, column)
        if presplit:
            lgrs_acc, l_coord, r_coord = split_lgrs_coordinate(
                str(props[lgrs_col]), str(props["L_coord"]), str(props["R_coord"]), empty_lgrs
            )
        else:
            lgrs_acc, l_coord, r_coord = clean_lgrs_coordinate(str(props[lgrs_col]), empty_lgrs)

        out_features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": int(props.get("id", i)),
                    "LGRS_ACC": lgrs_acc,
                    "L_coord": l_coord,
                    "R_coord": r_coord,
                    "row": row,
                    "column": column,
                },
                "geometry": {"type": "Point", "coordinates": bottom_left_coord(feat["geometry"])},
            }
        )

    # Grid line spacing in metres. Prefer the value stamped by generate_lgrs.py;
    # otherwise derive it from the LGRS_ACC length for hand-exported ESRI files
    # (6 chars → 100 m, 5 chars → 1 km).
    spacing = raw.get("spacing")
    if spacing is None and out_features:
        acc_len = len(str(out_features[0]["properties"]["LGRS_ACC"]))
        spacing = {6: 100, 5: 1000}.get(acc_len)

    return {
        "type": "FeatureCollection",
        "name": name,
        "crs": raw.get("crs", DEFAULT_CRS),
        "spacing": spacing or 0,
        "row_total": row + 1,  # +1 for AEGIS indexing
        "column_total": column + 1,
        "features": out_features,
    }


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("input", type=Path, help="Raw LGRS .geojson exported from ESRI/ArcGIS (WGS84).")
    p.add_argument(
        "-o",
        "--outdir",
        type=Path,
        default=None,
        help="Output directory (default: alongside the input). Writes Cleaned_<name>.geojson.",
    )
    return p


def main() -> None:
    args = make_parser().parse_args()
    in_path: Path = args.input.resolve()
    if not in_path.exists():
        print(f"ERROR: input not found: {in_path}", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(in_path.read_text(encoding="utf-8"))
    name = in_path.stem
    grid = convert(raw, name)

    out_dir = (args.outdir or in_path.parent).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"Cleaned_{name}.geojson"
    out_path.write_text(json.dumps(grid, indent=4) + "\n", encoding="utf-8")

    print(f"Wrote {out_path}")
    print(f"  features={len(grid['features'])}  row_total={grid['row_total']}  column_total={grid['column_total']}")


if __name__ == "__main__":
    main()
