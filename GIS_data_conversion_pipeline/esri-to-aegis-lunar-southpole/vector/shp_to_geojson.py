"""Convert a shapefile to GeoJSON, reprojecting to EPSG:4326, keeping attributes.

AEGIS loads vector sublayers as GeoJSON in geographic coordinates and reprojects
on the client:

    new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "IAU2000:30166" })

So this script reprojects the source geometry (e.g. Lunar South Pole
Stereographic) to EPSG:4326 lon/lat and writes a GeoJSON FeatureCollection,
carrying every attribute through to ``feature.properties`` for popups/labels.

For the A03MP026 landing ellipse the source has a body-specific stereographic
CRS on a 1737400 m sphere; the lon/lat output is interpreted by AEGIS against
the lunar body, so the planar→geographic transform is what matters (it is the
inverse of the stereographic projection), not any Earth datum.

Uses fiona (which bundles its own GDAL/OGR) plus pyproj for the coordinate
transform — both provided as conda-forge binaries by the pixi env, so run it
under ``pixi run`` (fiona is not importable under a bare ``.venv``/``uv``).

Usage:
    cd data_conversion_scripts

    pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py \\
        <drop>/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \\
        <out>/Data/ellipse.geojson --to-epsg 4326
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Force UTF-8 stdout/stderr so Unicode in help/progress text doesn't crash on a
# default cp1252 Windows console (no need to set PYTHONUTF8=1 first).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

try:
    import fiona
    from fiona.transform import transform_geom
except ImportError:  # pragma: no cover - guidance path
    print(
        "ERROR: fiona is required.\n"
        "Run this script under the pixi env:\n"
        "  pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py ...",
        file=sys.stderr,
    )
    sys.exit(1)


def _to_plain(obj):
    """Recursively convert fiona Geometry/Properties (and OrderedDicts, tuples)
    into plain JSON-serializable Python objects.

    Newer fiona returns ``fiona.Geometry`` objects from ``transform_geom`` and
    a ``Properties`` mapping from features; neither is directly accepted by
    ``json.dumps``. Both expose a mapping interface (and Geometry has
    ``__geo_interface__``), so normalize them here.
    """
    # fiona Geometry exposes a GeoJSON mapping via __geo_interface__
    geo = getattr(obj, "__geo_interface__", None)
    if geo is not None and not isinstance(obj, (dict, list, tuple)):
        return _to_plain(geo)
    if isinstance(obj, dict):
        return {key: _to_plain(value) for key, value in obj.items()}
    # Catch fiona Properties / other Mapping types that aren't plain dict
    items = getattr(obj, "items", None)
    if callable(items) and not isinstance(obj, (str, bytes)):
        return {key: _to_plain(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_plain(value) for value in obj]
    return obj


def convert(
    src_path: Path,
    dst_path: Path,
    to_epsg: int,
    precision: int | None,
) -> None:
    dst_crs = f"EPSG:{to_epsg}"

    with fiona.open(src_path) as src:
        src_crs = src.crs_wkt or (src.crs.to_wkt() if src.crs else None)
        if not src_crs:
            print(
                "ERROR: source has no CRS (.prj missing?). Cannot reproject safely.",
                file=sys.stderr,
            )
            sys.exit(1)

        print("-" * 60)
        print("Shapefile → GeoJSON")
        print("-" * 60)
        print(f"  Source:      {src_path}")
        print(f"  Destination: {dst_path}")
        print(f"  Features:    {len(src)}")
        print(f"  Geometry:    {src.schema.get('geometry')}")
        print(f"  Source CRS:  {str(src_crs)[:80]}...")
        print(f"  Target CRS:  {dst_crs}")
        print()

        features: list[dict] = []
        for feat in src:
            geom = feat["geometry"]
            if geom is None:
                continue
            # fiona.transform.transform_geom handles the inverse stereographic
            # → lon/lat transform using the source's full CRS definition.
            geom_out = transform_geom(
                src_crs,
                dst_crs,
                geom,
                precision=precision if precision is not None else -1,
            )
            props = dict(feat["properties"])
            features.append(
                {
                    "type": "Feature",
                    "geometry": _to_plain(geom_out),
                    "properties": _to_plain(props),
                }
            )

    fc = {
        "type": "FeatureCollection",
        "name": src_path.stem,
        "crs": {
            "type": "name",
            "properties": {"name": f"urn:ogc:def:crs:EPSG::{to_epsg}"},
        },
        "features": features,
    }

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    dst_path.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    size_kb = dst_path.stat().st_size / 1024
    print(f"  Wrote {len(features)} feature(s) → {dst_path} ({size_kb:.1f} KB)")
    if features:
        sample_props = features[0]["properties"]
        print(f"  Property keys carried: {sorted(sample_props.keys())}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Convert a shapefile to GeoJSON, reprojecting to EPSG:4326 and\n"
            "preserving attributes as feature properties. For AEGIS vector\n"
            "sublayers (dataProjection EPSG:4326, featureProjection set on load)."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example (from data_conversion_scripts/):\n"
            "  pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py \\\n"
            "      A03MP026_Ellipse.shp ellipse.geojson --to-epsg 4326\n"
        ),
    )
    parser.add_argument("input", type=Path, help="Input shapefile (.shp)")
    parser.add_argument("output", type=Path, help="Output GeoJSON path")
    parser.add_argument(
        "--to-epsg",
        type=int,
        default=4326,
        help="Target EPSG code (default: 4326 = WGS84 lon/lat)",
    )
    parser.add_argument(
        "--precision",
        type=int,
        default=None,
        help="Round output coordinates to N decimal places (default: full precision)",
    )

    args = parser.parse_args()

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("Shapefile → GeoJSON (reproject + attributes)")
    print("=" * 60)
    print()

    convert(args.input, args.output, args.to_epsg, args.precision)

    print("Load in AEGIS as a 'vector' sublayer:")
    print(
        '  new GeoJSON({ dataProjection: "EPSG:4326", '
        'featureProjection: "IAU2000:30166" })'
    )


if __name__ == "__main__":
    main()
