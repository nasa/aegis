"""Normalize one shapefile or GeoJSON file to AEGIS-loadable GeoJSON.

AEGIS loads vector sublayers as GeoJSON in geographic coordinates and reprojects
on the client:

    new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: projCode })

So this script must land every output feature in **longitude/latitude degrees**.
For a body-specific (lunar) projected source CRS, the correct operation is a
**Moon-to-Moon** transform: source CRS -> that CRS's own geodetic (lon/lat) CRS,
derived via ``pyproj.CRS.geodetic_crs``. Naively asking PROJ/Fiona to transform a
lunar projected CRS straight to Earth ``EPSG:4326`` is a **no-op that silently
"succeeds"**: PROJ detects the source and target ellipsoids belong to different
celestial bodies, refuses the datum shift, and Fiona returns the untransformed
input coordinates -- so meter-valued coordinates get written into a file labeled
EPSG:4326 with no error. See ``docs/MS3_20260812_VECTOR_IMPORT_AUDIT.md`` for the
full writeup and a worked example.

The lon/lat degrees this script writes are numerically the same regardless of
which body's ellipsoid produced them (the geodetic CRS derived from the lunar
stereographic CRS is a lunar geographic CRS) -- AEGIS's client-side reprojection
(``featureProjection: <mission's lunar cap-grid projCode>``) is what turns them
back into lunar cap-grid meters, so tagging the *output* file as "EPSG:4326" is
a naming convention, not a claim about Earth.

Supports:
  - Projected lunar shapefiles (e.g. Moon 2000 South Pole Stereographic,
    ``ESRI:103878``) -> reprojected to that CRS's geodetic lon/lat.
  - Already-geographic lunar shapefiles (e.g. ``ESRI:104903``) -> coordinates
    pass through unchanged (their "geodetic_crs" is themselves).
    - GeoJSON with a usable projected or geographic CRS -> handled through the
        same Fiona normalization path as shapefiles.
  - Optional polygon repair (``--repair-invalid``) via Shapely ``make_valid``
    for known-invalid deliveries (e.g. a self-intersecting ring), applied
    BEFORE reprojection (geometry repair is CRS-agnostic; simpler to validate
    in the source's own units).

Refuses instead of guessing:
    - No usable CRS on the source: hard error.
  - Any output coordinate outside [-180, 180] / [-90, 90] after transform:
    hard error (would indicate an unexpected CRS/transform failure).
    - Projected GeoJSON without a usable CRS is rejected by the geographic-bounds
        check rather than copied into ``Data/`` unchanged.

Uses fiona (which bundles its own GDAL/OGR) plus pyproj for the coordinate
transform and CRS introspection -- both provided as conda-forge binaries by the
pixi env, so run it under ``pixi run`` (fiona is not importable under a bare
``.venv``/``uv``). Shapely (used only for ``--repair-invalid``) is a pure-Python
wheel already pulled in transitively via geopandas.

Usage:
    cd GIS_data_conversion_pipeline

    pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py \
        <drop>/A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp \
        <out>/Data/ellipse.geojson

    # Repair a known-invalid polygon delivery (PSR self-intersection) and
    # assert the feature count survives the repair:
    pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py \
        RasterT_Int_psr2.shp psr.geojson --repair-invalid --expect-features 98
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

try:
    from pyproj import CRS
except ImportError:  # pragma: no cover - guidance path
    print(
        "ERROR: pyproj is required.\n"
        "Run this script under the pixi env:\n"
        "  pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py ...",
        file=sys.stderr,
    )
    sys.exit(1)


LON_LAT_TOL = 1e-6  # allow float round-off just past the exact bound


def _to_plain(obj):
    """Recursively convert fiona Geometry/Properties (and OrderedDicts, tuples)
    into plain JSON-serializable Python objects.

    Newer fiona returns ``fiona.Geometry`` objects from ``transform_geom`` and
    a ``Properties`` mapping from features; neither is directly accepted by
    ``json.dumps``. Both expose a mapping interface (and Geometry has
    ``__geo_interface__``), so normalize them here.
    """
    geo = getattr(obj, "__geo_interface__", None)
    if geo is not None and not isinstance(obj, (dict, list, tuple)):
        return _to_plain(geo)
    if isinstance(obj, dict):
        return {key: _to_plain(value) for key, value in obj.items()}
    items = getattr(obj, "items", None)
    if callable(items) and not isinstance(obj, (str, bytes)):
        return {key: _to_plain(value) for key, value in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_to_plain(value) for value in obj]
    return obj


def _iter_coords(coords):
    """Yield every (x, y[, z...]) leaf tuple from a nested GeoJSON coordinates array."""
    if not coords:
        return
    first = coords[0]
    if isinstance(first, (int, float)):
        yield coords
        return
    for item in coords:
        yield from _iter_coords(item)


def _assert_geographic_bounds(geom: dict, feature_index: int) -> None:
    """Hard-fail if any coordinate in a transformed geometry falls outside lon/lat bounds.

    Guards against a silent no-op transform (the exact failure mode this script exists to
    prevent -- see the module docstring) slipping through as "success".
    """
    geom_type = geom.get("type")
    if geom_type == "GeometryCollection":
        for sub in geom.get("geometries", []):
            _assert_geographic_bounds(sub, feature_index)
        return
    for x, y, *_ in _iter_coords(geom.get("coordinates")):
        if not (-180 - LON_LAT_TOL <= x <= 180 + LON_LAT_TOL) or not (
            -90 - LON_LAT_TOL <= y <= 90 + LON_LAT_TOL
        ):
            raise SystemExit(
                f"ERROR: feature {feature_index} produced an out-of-range coordinate "
                f"({x}, {y}) after reprojection -- the source CRS transform likely failed "
                "silently (Moon-to-Earth no-op) or the source geometry is corrupt. Refusing "
                "to write a GeoJSON with non-geographic coordinates."
            )


def _validate_geometry(geom: dict, repair_invalid: bool) -> tuple[dict, bool, bool]:
    """Return ``(geometry, was_invalid, was_repaired)`` using Shapely validation."""
    from shapely.geometry import mapping, shape
    from shapely.validation import make_valid

    shp = shape(geom)
    if shp.is_valid:
        return geom, False, False
    if not repair_invalid:
        return geom, True, False
    repaired = make_valid(shp)
    if repaired.is_empty or not repaired.is_valid:
        raise SystemExit("ERROR: make_valid did not produce a non-empty valid geometry")
    return _to_plain(mapping(repaired)), True, True


def convert(
    src_path: Path,
    dst_path: Path,
    precision: int | None,
    *,
    repair_invalid: bool = False,
    expect_features: int | None = None,
) -> dict:
    """Normalize one Fiona-supported vector source to GeoJSON at ``dst_path``.

    Returns a machine-readable audit summary dict (source CRS, output bounds, feature
    count, geometry types, invalid/repaired counts, property names).
    """
    with fiona.open(src_path) as src:
        src_crs_wkt = src.crs_wkt or (src.crs.to_wkt() if src.crs else None)
        if not src_crs_wkt:
            print(
                "ERROR: source has no usable CRS. Cannot normalize it safely.",
                file=sys.stderr,
            )
            sys.exit(1)

        src_crs_obj = CRS.from_wkt(src_crs_wkt)
        # The Moon-to-Moon fix: transform to the SOURCE CRS's OWN geodetic (lon/lat) CRS,
        # never to Earth EPSG:4326. For an already-geographic source, geodetic_crs is the
        # CRS itself, so this is a no-op passthrough (correct -- it's already lon/lat).
        dst_crs_obj = src_crs_obj.geodetic_crs
        if dst_crs_obj is None:
            print(
                f"ERROR: could not derive a geodetic CRS from the source CRS:\n  {src_crs_wkt}",
                file=sys.stderr,
            )
            sys.exit(1)
        dst_crs_wkt = dst_crs_obj.to_wkt()

        print("-" * 60)
        print("Vector -> GeoJSON (Moon-to-Moon)")
        print("-" * 60)
        print(f"  Source:      {src_path}")
        print(f"  Destination: {dst_path}")
        print(f"  Features:    {len(src)}")
        print(f"  Geometry:    {src.schema.get('geometry')}")
        print(f"  Source CRS:  {src_crs_obj.name}")
        print(f"  Target CRS:  {dst_crs_obj.name} (source's own geodetic CRS, lon/lat)")
        print()

        features: list[dict] = []
        geometry_types: dict[str, int] = {}
        property_keys: set[str] = set()
        invalid_count = 0
        repaired_count = 0
        null_geometry_count = 0
        min_x = min_y = float("inf")
        max_x = max_y = float("-inf")

        for index, feat in enumerate(src):
            geom = feat["geometry"]
            if geom is None:
                null_geometry_count += 1
                continue

            geom, was_invalid, was_repaired = _validate_geometry(
                _to_plain(geom), repair_invalid
            )
            if was_invalid:
                invalid_count += 1
                if was_repaired:
                    repaired_count += 1
                    print(
                        f"  [repair] feature {index} (Id={feat['properties'].get('Id', index)}) "
                        "had an invalid geometry -- repaired with make_valid"
                    )

            # fiona.transform.transform_geom handles the planar -> geodetic transform
            # using the source's full CRS definition (its OWN body's ellipsoid).
            try:
                geom_out = _to_plain(
                    transform_geom(
                        src_crs_wkt,
                        dst_crs_wkt,
                        geom,
                        precision=precision if precision is not None else -1,
                    )
                )
            except Exception as error:
                raise SystemExit(
                    f"ERROR: feature {index} could not be transformed safely: {error}"
                ) from error
            _assert_geographic_bounds(geom_out, index)

            geometry_types[geom_out.get("type", "Unknown")] = (
                geometry_types.get(geom_out.get("type", "Unknown"), 0) + 1
            )
            for x, y, *_ in _iter_coords(geom_out.get("coordinates")):
                min_x, max_x = min(min_x, x), max(max_x, x)
                min_y, max_y = min(min_y, y), max(max_y, y)

            props = dict(feat["properties"])
            property_keys.update(props.keys())
            features.append(
                {
                    "type": "Feature",
                    "geometry": geom_out,
                    "properties": _to_plain(props),
                }
            )

    if expect_features is not None and len(features) != expect_features:
        raise SystemExit(
            f"ERROR: expected {expect_features} feature(s) after conversion, got "
            f"{len(features)}. Refusing to write a GeoJSON with an unexpected feature count."
        )

    fc = {
        "type": "FeatureCollection",
        "name": src_path.stem,
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:EPSG::4326"},
        },
        "features": features,
    }

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    dst_path.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")

    size_kb = dst_path.stat().st_size / 1024
    print(f"\n  Wrote {len(features)} feature(s) -> {dst_path} ({size_kb:.1f} KB)")
    if features:
        print(f"  Property keys carried: {sorted(property_keys)}")
    print(f"  Geometry types: {geometry_types}")
    if invalid_count:
        print(f"  Invalid geometries: {invalid_count}; repaired: {repaired_count}")
    if null_geometry_count:
        print(f"  Omitted {null_geometry_count} feature(s) with null geometry")
    if features:
        print(
            f"  Output bounds: ({min_x:.7f}, {min_y:.7f}) to ({max_x:.7f}, {max_y:.7f})"
        )
    print()

    return {
        "source": str(src_path),
        "destination": str(dst_path),
        "source_crs": src_crs_obj.name,
        "target_crs": dst_crs_obj.name,
        "source_feature_count": len(features) + null_geometry_count,
        "feature_count": len(features),
        "geometry_types": geometry_types,
        "invalid_count": invalid_count,
        "repaired_count": repaired_count,
        "null_geometry_count": null_geometry_count,
        "property_keys": sorted(property_keys),
        "output_bounds": [min_x, min_y, max_x, max_y] if features else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize one shapefile or GeoJSON to AEGIS-loadable lon/lat GeoJSON, preserving\n"
            "attributes as feature properties. Performs a Moon-to-Moon transform (source\n"
            "CRS -> its own geodetic CRS), never a Moon-to-Earth EPSG:4326 no-op."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example (from GIS_data_conversion_pipeline/):\n"
            "  pixi run python esri-to-aegis-lunar-southpole/vector/shp_to_geojson.py \\\n"
            "      A03MP026_Ellipse.shp ellipse.geojson\n"
        ),
    )
    parser.add_argument(
        "input", type=Path, help="Input vector source (.shp, .geojson, or .json)"
    )
    parser.add_argument("output", type=Path, help="Output GeoJSON path")
    parser.add_argument(
        "--to-epsg",
        type=int,
        default=4326,
        help=(
            "Retained for CLI compatibility; output is always tagged EPSG:4326 lon/lat "
            "(the target CRS is always derived from the source, never overridden)."
        ),
    )
    parser.add_argument(
        "--precision",
        type=int,
        default=None,
        help="Round output coordinates to N decimal places (default: full precision)",
    )
    parser.add_argument(
        "--repair-invalid",
        action="store_true",
        help="Repair invalid polygon geometries with Shapely make_valid before reprojecting.",
    )
    parser.add_argument(
        "--expect-features",
        type=int,
        default=None,
        help="Hard-fail if the output feature count doesn't match this value.",
    )
    parser.add_argument(
        "--audit-out",
        type=Path,
        default=None,
        help="Optional path to write the machine-readable audit summary JSON.",
    )

    args = parser.parse_args()

    if args.to_epsg != 4326:
        print(
            "ERROR: --to-epsg only accepts 4326 -- the target CRS is always the source's "
            "own geodetic CRS (Moon-to-Moon), never an arbitrary override.",
            file=sys.stderr,
        )
        sys.exit(1)

    if not args.input.exists():
        print(f"ERROR: input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    print("=" * 60)
    print("Vector -> GeoJSON (Moon-to-Moon reproject + attributes)")
    print("=" * 60)
    print()

    audit = convert(
        args.input,
        args.output,
        args.precision,
        repair_invalid=args.repair_invalid,
        expect_features=args.expect_features,
    )

    if args.audit_out:
        args.audit_out.parent.mkdir(parents=True, exist_ok=True)
        args.audit_out.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
        print(f"  Audit summary written: {args.audit_out}")

    print("Load in AEGIS as a 'vector' sublayer:")
    print(
        '  new GeoJSON({ dataProjection: "EPSG:4326", '
        'featureProjection: "<mission projCode>" })'
    )


if __name__ == "__main__":
    main()
