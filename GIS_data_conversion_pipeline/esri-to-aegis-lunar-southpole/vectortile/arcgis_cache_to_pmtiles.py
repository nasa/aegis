#!/usr/bin/env python3
"""Pack an ArcGIS Vector Tile Package / Compact Cache V2 into a single ``.pmtiles`` archive.

The GIS team tiles dense vector data (e.g. the aggregated contours, ~286k line features) in
ArcGIS, in the lunar south-polar grid, and delivers it as a **Compact Cache V2** cache:
``.bundle`` files (128×128 tiles each) plus a ``root.json`` carrying the tile grid. We do
**not** re-tile from shapefiles (tippecanoe is Web-Mercator-only); the job here is to
**pack, not tile** — read the delivered cache, repackage it as a clustered MVT PMTiles, and
carry the tile-grid metadata across so OpenLayers can build the grid.

The whole producer→consumer contract is the **``esri_tile_info``** block copied from the
cache ``root.json`` into the PMTiles metadata: the OpenLayers side (`parseEsriPmtilesMetadata`
in ``src/components/interface/map/utils/parsers/esriPMTiles.ts``) reads ``esri_tile_info.lods``
+ origin/extent to build the vector tile grid and consumes the tiles in the native lunar
south-polar projection with **zero reprojection**. If ``esri_tile_info.lods`` is missing the
layer renders blank — always emit it.

Pure-Python (only the ``pmtiles`` writer, no GDAL), so it runs under ``.venv`` or ``pixi``.

Usage
-----
    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/vectortile/arcgis_cache_to_pmtiles.py \\
        <cache_dir_with_root.json> <output_dir> [--name contours] [--keep-gzip]

Example (the sample delivery):
    pixi run python esri-to-aegis-lunar-southpole/vectortile/arcgis_cache_to_pmtiles.py \\
        ../aegis_static/test/AggregatedContour/p12 \\
        ../aegis_static/test/AggregatedContour/extracted --name contours
    # -> extracted/contours.pmtiles
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
import sys
from pathlib import Path

# Windows consoles default to cp1252; force UTF-8 so banners with →/≥ don't crash.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass


# ---------------------------------------------------------------------------
# CompactV2 constants
# ---------------------------------------------------------------------------

# The bundle header is 64 bytes (header data + padding).
BUNDLE_HEADER_SIZE = 64
# Each bundle covers a 128×128 tile grid.
TILES_PER_BUNDLE = 128
# Each index entry is an 8-byte unsigned little-endian integer.
# Lower 40 bits = byte offset to tile data within the bundle; upper 24 bits = tile size.
INDEX_ENTRY_SIZE = 8
# Total index size = 128 * 128 * 8 = 131,072 bytes.
INDEX_SIZE = TILES_PER_BUNDLE * TILES_PER_BUNDLE * INDEX_ENTRY_SIZE


def parse_bundle_name(bundle_path: Path) -> tuple[int, int]:
    """Extract base row and column from a bundle filename.

    Example: ``R0180C0180.bundle`` → ``(base_row=384, base_col=384)``. The hex values encode
    the starting row/column of the 128×128 block.
    """
    name = bundle_path.stem  # e.g. "R0180C0180"
    parts = name.split("C")
    base_row = int(parts[0][1:], 16)
    base_col = int(parts[1], 16)
    return base_row, base_col


def iter_bundle_tiles(
    bundle_path: Path, zoom: int, decompress: bool
) -> list[tuple[int, int, int, bytes]]:
    """Return ``(z, y, x, tile_data)`` for every non-empty tile in a ``.bundle`` file."""
    base_row, base_col = parse_bundle_name(bundle_path)
    tiles: list[tuple[int, int, int, bytes]] = []

    data = bundle_path.read_bytes()
    data_len = len(data)

    for row_offset in range(TILES_PER_BUNDLE):
        for col_offset in range(TILES_PER_BUNDLE):
            idx = row_offset * TILES_PER_BUNDLE + col_offset
            index_pos = BUNDLE_HEADER_SIZE + idx * INDEX_ENTRY_SIZE
            if index_pos + INDEX_ENTRY_SIZE > data_len:
                continue

            entry = struct.unpack_from("<Q", data, index_pos)[0]
            tile_offset = entry & 0xFF_FFFF_FFFF
            tile_size = (entry >> 40) & 0xFF_FFFF

            if tile_size == 0 or tile_offset == 0:
                continue
            if tile_offset + tile_size > data_len:
                continue

            tile_data = data[tile_offset : tile_offset + tile_size]
            if not tile_data:
                continue

            if decompress and len(tile_data) >= 2 and tile_data[:2] == b"\x1f\x8b":
                try:
                    tile_data = gzip.decompress(tile_data)
                except OSError:
                    pass

            y = base_row + row_offset
            x = base_col + col_offset
            tiles.append((zoom, y, x, tile_data))

    return tiles


def build_pmtiles_metadata(input_dir: Path) -> dict:
    """Copy the ESRI tile-grid metadata from the cache ``root.json`` into PMTiles metadata.

    Emits ``esri_tile_info`` (the OpenLayers tile-grid contract) plus top-level
    ``vector_layers`` (layer ids/fields for styling/introspection).
    """
    metadata: dict = {}
    root_json = input_dir / "root.json"
    if not root_json.exists():
        print(
            f"  [warn] no root.json at {root_json} — esri_tile_info will be MISSING",
            file=sys.stderr,
        )
        return metadata

    root_data = json.loads(root_json.read_text(encoding="utf-8"))

    if "vector_layers" in root_data:
        metadata["vector_layers"] = root_data["vector_layers"]

    tile_info: dict = {}
    ti = root_data.get("tileInfo", {})
    for key in ("rows", "cols", "origin", "spatialReference", "lods"):
        if key in ti:
            tile_info[key] = ti[key]
    for key in (
        "initialExtent",
        "fullExtent",
        "minScale",
        "maxScale",
        "minLOD",
        "maxLOD",
        "name",
    ):
        if key in root_data:
            tile_info[key] = root_data[key]

    if tile_info:
        metadata["esri_tile_info"] = tile_info
    return metadata


def extract_to_pmtiles(input_dir: Path, pmtiles_path: Path, decompress: bool) -> None:
    """Extract every bundle into a single clustered ``.pmtiles`` archive."""
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer

    pmtiles_path.parent.mkdir(parents=True, exist_ok=True)

    tile_dir = input_dir / "tile"
    if not tile_dir.exists():
        print(f"ERROR: tile directory not found at {tile_dir}", file=sys.stderr)
        sys.exit(1)

    # Collect all tiles so we can write them sorted by tile_id (clustered PMTiles = best reads).
    all_tiles: list[tuple[int, bytes]] = []
    total_tiles = 0
    for zoom_dir in sorted(tile_dir.iterdir()):
        if not zoom_dir.is_dir() or not zoom_dir.name.startswith("L"):
            continue
        zoom = int(zoom_dir.name[1:])
        bundles = sorted(zoom_dir.glob("*.bundle"))
        zoom_tiles = 0
        for bundle_path in bundles:
            for z, y, x, tile_data in iter_bundle_tiles(bundle_path, zoom, decompress):
                all_tiles.append((zxy_to_tileid(z, x, y), tile_data))
                zoom_tiles += 1
        if zoom_tiles > 0:
            print(f"  z{zoom:<2} {zoom_tiles:>8,} tiles  ({len(bundles)} bundle(s))")
        total_tiles += zoom_tiles

    if total_tiles == 0:
        print("ERROR: no tiles found in the cache — nothing to write.", file=sys.stderr)
        sys.exit(1)

    all_tiles.sort(key=lambda t: t[0])

    # tile_compression must reflect what we actually wrote (sampled from the first tile).
    tile_compression = Compression.NONE
    if all_tiles and len(all_tiles[0][1]) >= 2 and all_tiles[0][1][:2] == b"\x1f\x8b":
        tile_compression = Compression.GZIP

    with open(pmtiles_path, "wb") as f:
        writer = Writer(f)
        for tid, data in all_tiles:
            writer.write_tile(tid, data)
        header = {"tile_type": TileType.MVT, "tile_compression": tile_compression}
        metadata = build_pmtiles_metadata(input_dir)
        if "esri_tile_info" not in metadata:
            print(
                "  [warn] esri_tile_info missing — OpenLayers cannot build the tile grid "
                "and the layer will render blank.",
                file=sys.stderr,
            )
        writer.finalize(header, metadata)

    size_mb = pmtiles_path.stat().st_size / (1024 * 1024)
    print(f"\n  {total_tiles:,} tiles → {pmtiles_path}  ({size_mb:.1f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "input_dir",
        type=Path,
        help="ArcGIS Compact Cache V2 dir (contains root.json and tile/).",
    )
    parser.add_argument(
        "output_dir", type=Path, help="Output directory for the .pmtiles archive."
    )
    parser.add_argument(
        "--name",
        default="contours",
        help="Output archive base name → <output_dir>/<name>.pmtiles (default: contours).",
    )
    parser.add_argument(
        "--pmtiles",
        type=Path,
        default=None,
        metavar="PATH",
        help="Explicit output .pmtiles path (overrides --name/output_dir).",
    )
    parser.add_argument(
        "--keep-gzip",
        action="store_true",
        help="Keep tiles gzip-compressed (default: decompress for simpler serving).",
    )
    args = parser.parse_args()

    if not args.input_dir.exists():
        print(f"ERROR: input directory not found: {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    pmtiles_path = args.pmtiles or (args.output_dir / f"{args.name}.pmtiles")
    decompress = not args.keep_gzip

    print("=" * 60)
    print("ArcGIS Compact Cache V2 → PMTiles")
    print("=" * 60)
    print(f"  input       {args.input_dir.resolve()}")
    print(f"  output      {pmtiles_path.resolve()}")
    print(f"  decompress  {decompress}")
    print()
    extract_to_pmtiles(args.input_dir, pmtiles_path, decompress)


if __name__ == "__main__":
    main()
