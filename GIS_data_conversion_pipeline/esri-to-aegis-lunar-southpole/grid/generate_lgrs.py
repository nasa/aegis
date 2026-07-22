#!/usr/bin/env python3
"""Generate a "raw" LGRS grid GeoJSON for an AEGIS landing site using the USGS ``lgrs``
package — the self-service replacement for the manual ESRI/ArcGIS export.

Why this exists
---------------
The companion ``convert_lgrs.py`` turns a *raw* Lunar Grid Reference System (LGRS) GeoJSON
into the AEGIS mission-grid GeoJSON. Historically that raw input had to be **hand-exported
from ESRI/ArcGIS** by the GIS team. The USGS/SETI `lgrs` package
(https://github.com/rbeyer/lgrs) can generate the grid programmatically, so this script
produces a raw GeoJSON in the **exact shape ``convert_lgrs.py`` already consumes** — the two
inputs (ESRI export vs. generated) are interchangeable.

    lat/lng + extent ──▶ lgrs.write_grid ──▶ reproject ──▶ raw GeoJSON ──▶ convert_lgrs.py

What it does
------------
* Takes the **lander location as ``--lat/--lng``** (always available) and a square
  ``--extent`` (e.g. ``10km``) centred on it; builds a projected (Lunar Polar Stereographic,
  metres) bounding box and calls ``lgrs.write_grid(..., acc=True)`` at ``--precision`` metres.
* ``lgrs`` writes polygons in the lunar **LPS metres** CRS (GeoJSON drops that CRS, so we
  re-assign it). We reproject the cell corners to lunar geographic **lon/lat** (numerically
  identical to EPSG:4326 degrees, which is how AEGIS interprets the file) and emit, per cell:
    - ``LGRS_ACC``  : the full LGRS grid string (e.g. ``"AZUZ4F3"``) — carried for reference;
    - ``L_coord`` / ``R_coord`` : the ACC *condensed* easting/northing halves (e.g. ``Z4`` /
      ``F3``) — the label AEGIS shows ("L_coord R_coord");
    - ``centY`` : the cell-centre northing in **metres** — ``convert_lgrs.py`` uses it to
      detect row boundaries.
* Polygons are emitted with **vertex 0 = the cell's bottom-left corner** (AEGIS's label
  anchor) and the features are ordered **row-major in metres** (northing then easting), both
  of which ``convert_lgrs.py`` relies on.

Output is therefore a raw GeoJSON; run ``convert_lgrs.py`` on it to produce the AEGIS grid.

Usage
-----
::

    pixi run python esri-to-aegis-lunar-southpole/grid/generate_lgrs.py --lat -84.8 --lng 0
    pixi run python esri-to-aegis-lunar-southpole/grid/generate_lgrs.py \
        --lat -84.8 --lng 0 --extent 10km --precision 100 -o raw_grid.geojson

Requires the geospatial env (``lgrs`` + ``geopandas`` via pixi). Then:

    pixi run python esri-to-aegis-lunar-southpole/grid/convert_lgrs.py raw_grid.geojson
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

# Force UTF-8 stdout/stderr so Unicode in help/progress text doesn't crash on a default
# cp1252 Windows console.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# WGS84/CRS84 member written into the output; AEGIS reads the grid as EPSG:4326 lon/lat.
DEFAULT_CRS = {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}}


def parse_extent_metres(text: str) -> float:
    """Parse an extent like ``10km``, ``500m`` or a bare number (metres) into metres."""
    s = text.strip().lower()
    try:
        if s.endswith("km"):
            return float(s[:-2]) * 1000.0
        if s.endswith("m"):
            return float(s[:-1])
        return float(s)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"Invalid --extent {text!r}; use e.g. '10km', '500m' or a number of metres."
        ) from exc


def split_condensed(condensed: str) -> tuple[str, str]:
    """Split an ACC condensed string (easting then northing levels) into L/R halves.

    100 m → ``"Z4F3"`` ⇒ ("Z4", "F3"); 1 km → ``"ZF"`` ⇒ ("Z", "F").
    """
    half = len(condensed) // 2
    return condensed[:half], condensed[half:]


def bottom_left_first_ring(minx: float, miny: float, maxx: float, maxy: float, transform):
    """Build a closed lon/lat ring for a cell, vertex 0 = bottom-left (min E, min N).

    ``transform`` maps (easting, northing) metres → (lon, lat) degrees.
    """
    corners_m = [
        (minx, miny),  # bottom-left  (the AEGIS anchor — index 0)
        (maxx, miny),  # bottom-right
        (maxx, maxy),  # top-right
        (minx, maxy),  # top-left
        (minx, miny),  # close
    ]
    return [list(transform(x, y)) for x, y in corners_m]


def generate(lat: float, lng: float, extent_m: float, precision: int) -> dict:
    """Generate the raw LGRS FeatureCollection for a square AOI around (lat, lng)."""
    # Heavy geo imports are lazy so --help stays fast and import errors are actionable.
    try:
        import geopandas
        import pyproj
        from lgrs import GeographicBounds, ProjectedBounds, make_lunar_crs, write_grid
    except ImportError as exc:  # pragma: no cover - guidance path
        print(
            "ERROR: this script needs the geospatial env (lgrs + geopandas).\n"
            "Run it under pixi:  pixi run python .../grid/generate_lgrs.py ...",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc

    geo_crs = GeographicBounds.crs  # lunar geographic (IAU_2015:30100)
    lps_crs = make_lunar_crs(proj="lps", south=True)  # Lunar Polar Stereographic (south)

    to_lps = pyproj.Transformer.from_crs(geo_crs, lps_crs, always_xy=True)
    to_geo = pyproj.Transformer.from_crs(lps_crs, geo_crs, always_xy=True)

    cx, cy = to_lps.transform(lng, lat)
    half = extent_m / 2.0
    bounds = ProjectedBounds(cx - half, cy - half, cx + half, cy + half, crs_hint=lps_crs)

    # lgrs requires a '{}' placeholder in the path; a single-CRS AOI yields exactly one file.
    with tempfile.TemporaryDirectory() as tmp:
        template = Path(tmp) / "lgrs_{}.json"
        write_grid(bounds, precision, template, acc=True, mode="w")
        out_files = list(Path(tmp).glob("*.json"))
        if not out_files:
            raise RuntimeError("lgrs.write_grid produced no output (empty AOI?).")
        gdf = geopandas.read_file(out_files[0])

    # GeoJSON dropped the projected CRS (read back mislabeled as 4326); re-assign the truth.
    gdf = gdf.set_crs(lps_crs, allow_override=True)

    cells = []
    for _, row in gdf.iterrows():
        minx, miny, maxx, maxy = row.geometry.bounds
        condensed = str(row["condensed"])
        l_coord, r_coord = split_condensed(condensed)
        cells.append(
            {
                "centY": (miny + maxy) / 2.0,
                "centX": (minx + maxx) / 2.0,
                "ring": bottom_left_first_ring(minx, miny, maxx, maxy, to_geo.transform),
                "LGRS_ACC": str(row["string"]),
                "L_coord": l_coord,
                "R_coord": r_coord,
            }
        )

    # Row-major in metres: northing ascending (rows go up), then easting ascending.
    cells.sort(key=lambda c: (c["centY"], c["centX"]))

    features = [
        {
            "type": "Feature",
            "properties": {
                "id": i,
                "LGRS_ACC": c["LGRS_ACC"],
                "L_coord": c["L_coord"],
                "R_coord": c["R_coord"],
                "centY": c["centY"],
            },
            "geometry": {"type": "Polygon", "coordinates": [c["ring"]]},
        }
        for i, c in enumerate(cells)
    ]

    return {
        "type": "FeatureCollection",
        "name": f"LGRS_{precision}m_{lat}_{lng}",
        "crs": DEFAULT_CRS,
        "spacing": precision,  # metres between adjacent grid lines (persisted for AEGIS)
        "features": features,
    }


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--lat", type=float, required=True, help="Lander latitude in degrees.")
    p.add_argument("--lng", type=float, required=True, help="Lander longitude in degrees.")
    p.add_argument(
        "--extent",
        type=parse_extent_metres,
        default="10km",
        help="Square grid extent centred on the lander (e.g. '10km', '500m'). Default 10km.",
    )
    p.add_argument(
        "--precision",
        type=int,
        default=100,
        help="Grid cell size in metres (default: 100).",
    )
    p.add_argument(
        "-o",
        "--out",
        type=Path,
        default=None,
        help="Output GeoJSON path (default: ./raw_lgrs_<precision>m_<lat>_<lng>.geojson).",
    )
    return p


def main() -> None:
    args = make_parser().parse_args()

    print("=" * 60)
    print("Generate raw LGRS grid (lgrs → raw GeoJSON for convert_lgrs.py)")
    print("=" * 60)
    print(f"  Lander:    lat={args.lat} lng={args.lng}")
    print(f"  Extent:    {args.extent:.0f} m square")
    print(f"  Precision: {args.precision} m")
    print()

    grid = generate(args.lat, args.lng, args.extent, args.precision)

    out_path = args.out or Path(
        f"raw_lgrs_{args.precision}m_{args.lat}_{args.lng}.geojson"
    )
    out_path = out_path.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(grid, ensure_ascii=False), encoding="utf-8")

    print(f"Wrote {out_path}")
    print(f"  features={len(grid['features'])}")
    print()
    print("Next: produce the AEGIS mission-grid with")
    print(f"  pixi run python esri-to-aegis-lunar-southpole/grid/convert_lgrs.py {out_path.name}")


if __name__ == "__main__":
    main()
