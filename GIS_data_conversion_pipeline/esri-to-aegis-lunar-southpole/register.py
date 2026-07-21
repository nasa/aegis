#!/usr/bin/env python3
"""Register a built mission into AEGIS over HTTP (mission fields + layers + sublayers + grid).

Given a built output root (``<static>/missionFiles/<id>`` with ``Data/`` and ``Layers/``)
and an existing mission id, this:

  1. Updates the mission's GIS/setup fields (projection cap-grid profile, lander location,
     demFilePath/demResolution, name, actionSystemVersion=2, usingLGRSCoordinates=true) via
     ``POST /api/v1/missionAutomerge/fields``.
  2. Ensures the header layers exist: ``Common_LSP`` (external NAC basemap only),
     ``Raster`` (all tiled layers), ``Vector`` (all GeoJSON layers).
  3. Builds one sublayer per built ``Layers/<dir>``, classified by folder contents: a raster tile
     pyramid (``tilemapresource.xml`` → boundingBox/zoom; name/description/legend/tilePattern from
     ``properties.json``), a COG (``.tif``/``.tiff``), or a PMTiles archive (``.pmtiles``); plus one
     per ``Data/*.geojson`` and the shared external NAC tile layer.
  4. Skips any sublayer whose (header, path) already exists, then POSTs the rest.
  5. If a grid GeoJSON is present, POSTs it as the **active** mission grid via
     ``POST /api/v1/grid`` (the server writes its coordinates to ``Data/<name>.json``).

Stdlib-only (no geospatial imports) so it runs under ``.venv`` or ``pixi``.

Standalone use:
    pixi run python esri-to-aegis-lunar-southpole/register.py \\
        --aegis-url http://localhost:4000 --mission-id 123 \\
        --mission-name "A03MP026 - ART3 Surface EVA MS 3" \\
        --lander-lat -84.223397 --lander-lng 33.5021945 \\
        --out F:/_repos/aegis_static/missionFiles/123 --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid as uuidlib
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import config
from aegis_api import AegisApiClient, load_token

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Mission GIS fields
# ---------------------------------------------------------------------------


def build_mission_fields(
    *,
    name: str | None,
    lander_lat: float | None,
    lander_lng: float | None,
    dem_rel_path: str | None,
    dem_resolution: float | None,
) -> dict:
    """Assemble the cap-grid projection profile + supplied metadata for the fields update."""
    fields: dict = {
        "projIsCustom": True,
        "projEpsg": config.PROJ_EPSG,
        "projProj4String": config.PROJ_PROJ4,
        "projBoundsMinX": config.CAP_MIN,
        "projBoundsMinY": config.CAP_MIN,
        "projBoundsMaxX": config.CAP_MAX,
        "projBoundsMaxY": config.CAP_MAX,
        "projOriginX": config.CAP_MIN,
        "projOriginY": config.CAP_MIN,
        "projResZoomLevel": 0,
        "projResUnitsPerPixel": config.CAP_Z0_RES,
        "planetRadius": config.PLANET_RADIUS,
        # AEGIS lunar south-pole missions use the v2 action system and LGRS coordinates.
        "actionSystemVersion": 2,
        "usingLGRSCoordinates": True,
    }
    if name:
        fields["name"] = name
    if lander_lat is not None and lander_lng is not None:
        fields["landerLocation"] = {"lat": lander_lat, "lng": lander_lng}
    if dem_rel_path:
        fields["demFilePath"] = dem_rel_path
    if dem_resolution is not None:
        fields["demResolution"] = dem_resolution
    return fields


# ---------------------------------------------------------------------------
# tilemapresource.xml / properties.json parsing
# ---------------------------------------------------------------------------


def parse_tilemapresource(tmr_path: Path) -> dict:
    """Return boundingBox + min/max native zoom from a tilemapresource.xml."""
    root = ET.parse(tmr_path).getroot()

    bb = root.find("BoundingBox")
    bounding_box: list[float] = []
    if bb is not None:
        bounding_box = [
            float(bb.get("minx", 0)),
            float(bb.get("miny", 0)),
            float(bb.get("maxx", 0)),
            float(bb.get("maxy", 0)),
        ]

    zooms = [
        int(ts.get("order"))
        for ts in root.iter("TileSet")
        if ts.get("order") is not None
    ]
    return {
        "boundingBox": bounding_box,
        "minNativeZoom": min(zooms) if zooms else 0,
        "maxNativeZoom": max(zooms) if zooms else 0,
    }


def read_properties(props_path: Path) -> dict:
    """Load a properties.json sidecar (name/description/legend/tilePattern/...) if present."""
    if not props_path.exists():
        return {}
    try:
        return json.loads(props_path.read_text(encoding="utf-8"))
    except (ValueError, OSError) as e:
        print(f"  [warn] could not read {props_path}: {e}", file=sys.stderr)
        return {}


# ---------------------------------------------------------------------------
# Sublayer builders
# ---------------------------------------------------------------------------


def _blank_sublayer(mission_id: int, layer_uuid: str) -> dict:
    return {
        "uuid": str(uuidlib.uuid4()),
        "missionId": mission_id,
        "layerUuid": layer_uuid,
        "type": "tile",
        "name": "",
        "description": "",
        "legend": {"legend": [], "unitsAbbr": "", "version": ""},
        "path": "",
        "tilePattern": "{z}/{x}/{y}.png",
        "boundingBox": [],
        "tileFormat": "tms",
        "minNativeZoom": 0,
        "maxNativeZoom": 0,
        "maxZoom": 30,
        "isTimeBased": False,
        "timeLayerManifest": [],
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }


def build_raster_sublayer(mission_id: int, layer_uuid: str, layer_dir: Path) -> dict:
    """A tile sublayer for a built Layers/<dir> (boundingBox/zoom from tmr, meta from props)."""
    sub = _blank_sublayer(mission_id, layer_uuid)
    sub["name"] = layer_dir.name
    sub["path"] = layer_dir.name

    tmr = layer_dir / "tilemapresource.xml"
    if tmr.exists():
        sub.update(parse_tilemapresource(tmr))

    # properties.json overrides name/description/legend/tilePattern/tileFormat/type.
    props = read_properties(layer_dir / "properties.json")
    for key in ("type", "name", "description", "legend", "tilePattern", "tileFormat"):
        if key in props:
            sub[key] = props[key]
    return sub


def build_vector_sublayer(mission_id: int, layer_uuid: str, geojson_file: Path) -> dict:
    """A vector sublayer for a Data/*.geojson file (path = filename)."""
    sub = _blank_sublayer(mission_id, layer_uuid)
    sub["type"] = "vector"
    sub["name"] = geojson_file.stem
    sub["path"] = geojson_file.name
    sub["tilePattern"] = ""
    return sub


def build_vector_tile_sublayer(
    mission_id: int, layer_uuid: str, layer_dir: Path, pmtiles_file: Path
) -> dict:
    """A vector-tile (PMTiles) sublayer for a Layers/<name>/<name>.pmtiles archive.

    Self-describing: the archive's embedded esri_tile_info carries the tile grid, so no
    tilePattern/tileFormat/boundingBox is set. The path is ``<folder>/<file>.pmtiles`` (AEGIS
    resolves it under the mission's Layers/ dir). name/description/legend come from an optional
    properties.json in the folder.
    """
    sub = _blank_sublayer(mission_id, layer_uuid)
    sub["type"] = "vector-tile"
    sub["name"] = layer_dir.name
    sub["path"] = f"{layer_dir.name}/{pmtiles_file.name}"
    sub["tilePattern"] = ""
    _apply_properties(sub, layer_dir)
    return sub


def build_cog_sublayer(
    mission_id: int, layer_uuid: str, layer_dir: Path, cog_file: Path
) -> dict:
    """A COG raster sublayer for a Layers/<stem>/<stem>_cog.tif.

    Self-describing: OpenLayers reads the GeoTIFF directly over HTTP Range, so no
    tilePattern/tileFormat/boundingBox/zoom is set. The app routes it to the WebGLTile/GeoTIFF path
    from the ``.tif`` extension in the path (``<folder>/<file>.tif``, resolved under Layers/).
    name/description/legend come from an optional properties.json in the folder.
    """
    sub = _blank_sublayer(mission_id, layer_uuid)
    sub["type"] = "tile"
    sub["name"] = layer_dir.name
    sub["path"] = f"{layer_dir.name}/{cog_file.name}"
    sub["tilePattern"] = ""
    _apply_properties(sub, layer_dir)
    return sub


def _apply_properties(sub: dict, layer_dir: Path) -> None:
    """Overlay an optional properties.json (name/description/legend) onto a self-describing sublayer."""
    props = read_properties(layer_dir / "properties.json")
    for key in ("name", "description", "legend"):
        if key in props:
            sub[key] = props[key]


def build_external_nac_sublayer(mission_id: int, layer_uuid: str) -> dict:
    """The shared external lunar south-pole NAC basemap tile sublayer."""
    nac = config.EXTERNAL_NAC
    sub = _blank_sublayer(mission_id, layer_uuid)
    sub["name"] = nac["name"]
    sub["description"] = nac["description"]
    sub["path"] = nac["base_url"]  # external: full base URL; final = path + "/" + tilePattern
    sub["tilePattern"] = nac["tile_pattern"]
    sub["boundingBox"] = list(nac["bounding_box"])
    sub["tileFormat"] = nac["tile_format"]
    sub["minNativeZoom"] = nac["min_native_zoom"]
    sub["maxNativeZoom"] = nac["max_native_zoom"]
    return sub


# ---------------------------------------------------------------------------
# Header layers
# ---------------------------------------------------------------------------


def ensure_header_layers(
    client: AegisApiClient, mission_id: int, names: list[str], *, dry_run: bool
) -> dict[str, str]:
    """Return {name: uuid} for each header layer, creating any that don't exist."""
    existing = {l["name"]: l["uuid"] for l in client.get_layers(mission_id)}
    name_to_uuid: dict[str, str] = {}
    to_create: list[dict] = []
    for name in names:
        if name in existing:
            name_to_uuid[name] = existing[name]
        else:
            new_uuid = str(uuidlib.uuid4())
            name_to_uuid[name] = new_uuid
            to_create.append(
                {
                    "uuid": new_uuid,
                    "missionId": mission_id,
                    "name": name,
                    "createdAt": now_iso(),
                    "updatedAt": now_iso(),
                }
            )

    if to_create:
        labels = ", ".join(l["name"] for l in to_create)
        if dry_run:
            print(f"  [dry-run] would create header layers: {labels}")
        else:
            client.upsert_layers(mission_id, to_create)
            print(f"  created header layers: {labels}")
    return name_to_uuid


def classify_layer_dir(layer_dir: Path) -> tuple[str, Path] | None:
    """Classify a built Layers/<dir> by what it contains.

    Returns ``(kind, artifact)`` where kind is one of:
      - ``"vector-tile"`` → the ``.pmtiles`` archive inside the folder
      - ``"cog"``         → the ``.tif``/``.tiff`` GeoTIFF inside the folder
      - ``"raster"``      → the folder itself (a ``tilemapresource.xml`` tile pyramid)
    Returns ``None`` if the folder matches none of these (skipped). This mirrors the AEGIS admin,
    which infers a layer's type from its folder contents rather than a stored flag.
    """
    pmtiles = sorted(layer_dir.glob("*.pmtiles"))
    if pmtiles:
        return ("vector-tile", pmtiles[0])
    tifs = sorted(
        f for f in layer_dir.iterdir()
        if f.is_file() and f.suffix.lower() in (".tif", ".tiff")
    )
    if tifs:
        return ("cog", tifs[0])
    if (layer_dir / "tilemapresource.xml").exists():
        return ("raster", layer_dir)
    return None


def find_vector_files(data_dir: Path) -> list[Path]:
    """GeoJSON files under Data/ (the grid's coordinate JSON is .json, so it is excluded)."""
    if not data_dir.exists():
        return []
    return sorted(f for f in data_dir.iterdir() if f.is_file() and f.suffix.lower() == ".geojson")


def find_dem_file(data_dir: Path) -> Path | None:
    """The mission DEM COG under Data/ (the ``*_cog.tif`` GeoTIFF). Used for the demFilePath.

    Custom COG *sublayers* live under Layers/ (not Data/), so Data/ holds only the DEM COG,
    which — like every COG we generate — carries the ``_cog`` marker (see config.dem_output_name).
    """
    if not data_dir.exists():
        return None
    tifs = sorted(
        f
        for f in data_dir.iterdir()
        if f.is_file() and f.suffix.lower() in (".tif", ".tiff") and f.stem.endswith("_cog")
    )
    return tifs[0] if tifs else None


# ---------------------------------------------------------------------------
# Mission grid (LGRS)
# ---------------------------------------------------------------------------


def build_mission_grid(
    geojson_path: Path, mission_id: int, existing_grids: list[dict]
) -> dict:
    """Build a MissionGrid (gridInformation + 2D coordinates) from an AEGIS grid GeoJSON.

    Mirrors the admin's gridUpload.tsx transform: a FeatureCollection of Point features with
    row/column/id/L_coord/R_coord is turned into a ``coordinates[row][col]`` array with the
    row index inverted (``row_total - row - 1``) and ``[lon,lat]`` → ``{lat,lng}``. Reuses an
    existing grid's uuid/fileName when one of the same name exists, so re-runs update in place.
    """
    fc = json.loads(geojson_path.read_text(encoding="utf-8"))
    # The raw GeoJSON's internal name is just the scratch filename ("raw_grid"); use a clean,
    # stable grid name so the Data/ coordinate file and admin label are meaningful.
    name = config.GRID_DEFAULT_NAME
    row_total = int(fc["row_total"])
    col_total = int(fc["column_total"])

    coordinates: list[list[dict]] = [[None] * col_total for _ in range(row_total)]  # type: ignore[list-item]
    for feat in fc["features"]:
        props = feat["properties"]
        lon, lat = feat["geometry"]["coordinates"][0], feat["geometry"]["coordinates"][1]
        row, col = int(props["row"]), int(props["column"])
        inv_row = row_total - row - 1
        label = f"{props.get('L_coord', '')} {props.get('R_coord', '')}".strip()
        coordinates[inv_row][col] = {
            "id": props.get("id"),
            "index": {"row": inv_row, "col": col},
            "coordinates": {"lat": lat, "lng": lon},
            "name": label,
        }

    prior = next((g["gridInformation"] for g in existing_grids
                  if g.get("gridInformation", {}).get("name") == name), None)
    grid_uuid = prior["uuid"] if prior else str(uuidlib.uuid4())
    file_name = prior["fileName"] if prior else f"{name}.json"

    return {
        "gridInformation": {
            "uuid": grid_uuid,
            "missionId": mission_id,
            "numRows": row_total,
            "numCols": col_total,
            "spacing": 0,
            "name": name,
            "fileName": file_name,
            "isActiveGrid": True,
        },
        "coordinates": coordinates,
    }


# ---------------------------------------------------------------------------
# Top-level
# ---------------------------------------------------------------------------


def register_mission(
    client: AegisApiClient,
    *,
    mission_id: int,
    out_dir: Path,
    mission_fields: dict | None,
    include_external_nac: bool = True,
    grid_geojson: Path | None = None,
    dry_run: bool = False,
) -> None:
    """Update mission fields, ensure header layers, upsert sublayers, and register the grid."""
    out_dir = out_dir.resolve()
    layers_dir = out_dir / config.OUT_LAYERS_DIRNAME
    data_dir = out_dir / config.OUT_DATA_DIRNAME

    # ── 1. mission fields ──────────────────────────────────────────────────
    if mission_fields:
        if dry_run:
            print(f"  [dry-run] would update mission {mission_id} fields: {sorted(mission_fields)}")
        else:
            client.update_mission_fields(mission_id, mission_fields)
            print(f"  updated mission {mission_id} fields: {sorted(mission_fields)}")

    # ── 2. header layers ───────────────────────────────────────────────────
    # Every built layer is a folder under Layers/; classify each by its contents (raster tile
    # pyramid, COG GeoTIFF, or PMTiles archive). Vectors are GeoJSON files under Data/.
    layer_dirs = (
        sorted(d for d in layers_dir.iterdir() if d.is_dir()) if layers_dir.exists() else []
    )
    raster_dirs: list[Path] = []
    cog_layers: list[tuple[Path, Path]] = []
    vector_tile_layers: list[tuple[Path, Path]] = []
    for d in layer_dirs:
        kind = classify_layer_dir(d)
        if kind is None:
            continue
        if kind[0] == "raster":
            raster_dirs.append(d)
        elif kind[0] == "cog":
            cog_layers.append((d, kind[1]))
        elif kind[0] == "vector-tile":
            vector_tile_layers.append((d, kind[1]))
    vector_files = find_vector_files(data_dir)

    if not (raster_dirs or vector_files or vector_tile_layers or cog_layers):
        print(
            f"  [warn] no tile/COG/PMTiles layers under {layers_dir} or vectors under {data_dir}.\n"
            "         For a register-only run, pass --out pointing at the locally-built "
            "mission folder (its Layers/ + Data/).",
            file=sys.stderr,
        )

    has_raster = bool(raster_dirs or cog_layers)
    has_vector = bool(vector_files or vector_tile_layers)
    needed_headers: list[str] = []
    if include_external_nac:
        needed_headers.append(config.HEADER_COMMON_LSP)
    if has_raster:
        needed_headers.append(config.HEADER_RASTER)
    if has_vector:
        needed_headers.append(config.HEADER_VECTOR)

    headers = ensure_header_layers(client, mission_id, needed_headers, dry_run=dry_run)

    # ── 3. build sublayers ─────────────────────────────────────────────────
    sublayers: list[dict] = []
    if include_external_nac:
        sublayers.append(
            build_external_nac_sublayer(mission_id, headers[config.HEADER_COMMON_LSP])
        )
    for layer_dir in raster_dirs:
        sublayers.append(build_raster_sublayer(mission_id, headers[config.HEADER_RASTER], layer_dir))
    for layer_dir, cog_file in cog_layers:
        sublayers.append(
            build_cog_sublayer(mission_id, headers[config.HEADER_RASTER], layer_dir, cog_file)
        )
    for geojson_file in vector_files:
        sublayers.append(
            build_vector_sublayer(mission_id, headers[config.HEADER_VECTOR], geojson_file)
        )
    for layer_dir, pmtiles_file in vector_tile_layers:
        sublayers.append(
            build_vector_tile_sublayer(
                mission_id, headers[config.HEADER_VECTOR], layer_dir, pmtiles_file
            )
        )

    # ── 4. skip already-registered (header, path) pairs ────────────────────
    existing_pairs = {(s["layerUuid"], s["path"]) for s in client.get_sublayers(mission_id)}
    to_insert = [s for s in sublayers if (s["layerUuid"], s["path"]) not in existing_pairs]
    skipped = len(sublayers) - len(to_insert)
    if skipped:
        print(f"  skipping {skipped} sublayer(s) already registered")

    print(f"  sublayers to insert: {len(to_insert)}")
    for s in to_insert:
        print(f"    [{s['type']}] {s['name']}  path={s['path']}")
    if to_insert:
        if dry_run:
            print("  [dry-run] no sublayers POSTed.")
        else:
            client.upsert_sublayers(mission_id, to_insert)
            print(f"  registered {len(to_insert)} sublayer(s).")
    else:
        print("  no new sublayers.")

    # ── 5. mission grid (active) ───────────────────────────────────────────
    if grid_geojson and grid_geojson.exists():
        if dry_run:
            print(f"  [dry-run] would register active grid from {grid_geojson.name}")
        else:
            existing = client.get_grids(mission_id)
            grid = build_mission_grid(grid_geojson, mission_id, existing)
            client.upsert_grids(mission_id, [grid], upsert_full_grid=True)
            gi = grid["gridInformation"]
            print(
                f"  registered active grid '{gi['name']}' "
                f"({gi['numRows']}x{gi['numCols']}) -> Data/{gi['fileName']}"
            )
    elif grid_geojson:
        print(f"  [warn] grid source not found: {grid_geojson}", file=sys.stderr)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--aegis-url", default="http://localhost:4000", help="AEGIS base URL.")
    parser.add_argument("--mission-id", type=int, required=True, help="Existing mission id.")
    parser.add_argument("--mission-name", default=None, help="Mission name to set.")
    parser.add_argument("--lander-lat", type=float, default=None, help="Lander latitude.")
    parser.add_argument("--lander-lng", type=float, default=None, help="Lander longitude.")
    parser.add_argument("--out", type=Path, required=True, help="Built mission folder (Data/, Layers/).")
    parser.add_argument("--dem-resolution", type=float, default=None, help="DEM resolution (m/px).")
    parser.add_argument("--token", default=None, help="EMSS token (default: EMSS_TOKEN from .env).")
    parser.add_argument("--no-external-nac", action="store_true", help="Do not add the Common_LSP NAC layer.")
    parser.add_argument("--no-mission-fields", action="store_true", help="Do not update mission fields.")
    parser.add_argument("--no-grid", action="store_true", help="Do not register the mission grid.")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without calling the API.")
    args = parser.parse_args()

    token = args.token or load_token()
    if not token:
        print("ERROR: no EMSS token (pass --token or set EMSS_TOKEN in .env)", file=sys.stderr)
        sys.exit(1)

    dem_file = find_dem_file(args.out / config.OUT_DATA_DIRNAME)
    dem_rel = f"{config.OUT_DATA_DIRNAME}/{dem_file.name}" if dem_file else None

    mission_fields = None
    if not args.no_mission_fields:
        mission_fields = build_mission_fields(
            name=args.mission_name,
            lander_lat=args.lander_lat,
            lander_lng=args.lander_lng,
            dem_rel_path=dem_rel,
            dem_resolution=args.dem_resolution,
        )

    grid_geojson = None if args.no_grid else (args.out / config.OUT_GRID_SOURCE_NAME)

    client = AegisApiClient(args.aegis_url, token)
    register_mission(
        client,
        mission_id=args.mission_id,
        out_dir=args.out,
        mission_fields=mission_fields,
        include_external_nac=not args.no_external_nac,
        grid_geojson=grid_geojson,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    main()
