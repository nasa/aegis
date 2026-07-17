"""
Build a PMTiles archive from ArcGIS Compact Cache V2 (.bundle) files.

The CompactV2 format packs tiles into 128×128 bundles. Each .bundle file contains
a header, a tile index, and concatenated tile data. This script reads the index,
extracts each tile, optionally decompresses gzip, and writes a clustered PMTiles
archive with embedded ESRI tile-grid metadata from the input root.json.

Usage:
    cd data_conversion_scripts
    uv run python arcgis_compact_cache_v2_to_pmtiles.py <input_dir> <output_dir> [--keep-gzip]
    uv run python arcgis_compact_cache_v2_to_pmtiles.py <input_dir> <output_dir> --pmtiles out.pmtiles

Example:
    uv run python arcgis_compact_cache_v2_to_pmtiles.py \
        ../../aegis_static/test/AggregatedContour/p12 \
        ../../aegis_static/test/AggregatedContour/extracted

By default the archive is written to <output_dir>/contours.pmtiles.
"""

from __future__ import annotations

import argparse
import gzip
import json
import struct
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# CompactV2 constants
# ---------------------------------------------------------------------------

# The bundle header is 64 bytes (header data + padding).
BUNDLE_HEADER_SIZE = 64

# Each bundle covers a 128×128 tile grid.
TILES_PER_BUNDLE = 128

# Each index entry is an 8-byte unsigned little-endian integer.
# Lower 40 bits = byte offset to tile data within the bundle.
# Upper 24 bits = tile data size (including a 4-byte length prefix).
INDEX_ENTRY_SIZE = 8

# Total index size = 128 * 128 * 8 = 131,072 bytes.
INDEX_SIZE = TILES_PER_BUNDLE * TILES_PER_BUNDLE * INDEX_ENTRY_SIZE


def parse_bundle_name(bundle_path: Path) -> tuple[int, int]:
    """
    Extract base row and column from bundle filename.

    Example: R0180C0180.bundle → (base_row=384, base_col=384)
    The hex values encode the starting row/column of the 128×128 block.
    """
    name = bundle_path.stem  # e.g. "R0180C0180"
    parts = name.split("C")
    base_row = int(parts[0][1:], 16)
    base_col = int(parts[1], 16)
    return base_row, base_col


def iter_bundle_tiles(
    bundle_path: Path,
    zoom: int,
    decompress: bool,
) -> list[tuple[int, int, int, bytes]]:
    """
    Return (z, y, x, tile_data) for every non-empty tile in a .bundle file.
    """
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
                except Exception:
                    pass

            y = base_row + row_offset
            x = base_col + col_offset
            tiles.append((zoom, y, x, tile_data))

    return tiles


def build_pmtiles_metadata(input_dir: Path) -> dict:
    """Build PMTiles metadata from the input ArcGIS cache metadata files."""

    metadata: dict = {}
    root_json = input_dir / "root.json"
    if not root_json.exists():
        return metadata

    root_data = json.loads(root_json.read_text(encoding="utf-8"))

    if "vector_layers" in root_data:
        metadata["vector_layers"] = root_data["vector_layers"]

    tile_info: dict = {}
    if "tileInfo" in root_data:
        ti = root_data["tileInfo"]
        tile_info["rows"] = ti.get("rows")
        tile_info["cols"] = ti.get("cols")
        tile_info["origin"] = ti.get("origin")
        tile_info["spatialReference"] = ti.get("spatialReference")
        tile_info["lods"] = ti.get("lods")
    if "initialExtent" in root_data:
        tile_info["initialExtent"] = root_data["initialExtent"]
    if "fullExtent" in root_data:
        tile_info["fullExtent"] = root_data["fullExtent"]
    if "minScale" in root_data:
        tile_info["minScale"] = root_data["minScale"]
    if "maxScale" in root_data:
        tile_info["maxScale"] = root_data["maxScale"]
    if "minLOD" in root_data:
        tile_info["minLOD"] = root_data["minLOD"]
    if "maxLOD" in root_data:
        tile_info["maxLOD"] = root_data["maxLOD"]
    if "name" in root_data:
        tile_info["name"] = root_data["name"]

    if tile_info:
        metadata["esri_tile_info"] = tile_info

    return metadata


def extract_to_pmtiles(
    input_dir: Path,
    pmtiles_path: Path,
    decompress: bool,
) -> None:
    """Extract all bundles directly into a single .pmtiles archive."""
    from pmtiles.writer import Writer
    from pmtiles.tile import TileType, Compression, zxy_to_tileid

    pmtiles_path.parent.mkdir(parents=True, exist_ok=True)

    tile_dir = input_dir / "tile"
    if not tile_dir.exists():
        print(f"ERROR: tile directory not found at {tile_dir}", file=sys.stderr)
        sys.exit(1)

    # Collect all tiles so we can write them sorted by tile_id (required for
    # clustered PMTiles, which gives the best read performance).
    all_tiles: list[tuple[int, bytes]] = []  # (tileid, data)

    total_tiles = 0
    for zoom_dir in sorted(tile_dir.iterdir()):
        if not zoom_dir.is_dir() or not zoom_dir.name.startswith("L"):
            continue

        zoom = int(zoom_dir.name[1:])
        bundles = sorted(zoom_dir.glob("*.bundle"))
        zoom_tiles = 0

        for bundle_path in bundles:
            tiles = iter_bundle_tiles(bundle_path, zoom, decompress)
            for z, y, x, tile_data in tiles:
                tid = zxy_to_tileid(z, x, y)
                all_tiles.append((tid, tile_data))
            zoom_tiles += len(tiles)

        if zoom_tiles > 0:
            print(f"  Zoom {zoom:2d}: {zoom_tiles:>8,} tiles  ({len(bundles)} bundle(s))")

        total_tiles += zoom_tiles

    # Sort by tile_id for clustered output
    all_tiles.sort(key=lambda t: t[0])

    with open(pmtiles_path, "wb") as f:
        writer = Writer(f)
        for tid, data in all_tiles:
            writer.write_tile(tid, data)

        # Determine tile compression from sample
        tile_compression = Compression.NONE
        if all_tiles:
            sample = all_tiles[0][1]
            if len(sample) >= 2 and sample[:2] == b"\x1f\x8b":
                tile_compression = Compression.GZIP

        header = {
            "tile_type": TileType.MVT,
            "tile_compression": tile_compression,
        }
        writer.finalize(header, build_pmtiles_metadata(input_dir))

    print(f"\n  Total: {total_tiles:,} tiles written to {pmtiles_path}")
    size_mb = pmtiles_path.stat().st_size / (1024 * 1024)
    print(f"  Archive size: {size_mb:.1f} MB")
def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Build a clustered PMTiles archive from ArcGIS Compact Cache V2 "
            "(.bundle) vector tile caches."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Example:\n"
            "  uv run python arcgis_compact_cache_v2_to_pmtiles.py \\\n"
            "      ../../aegis_static/test/AggregatedContour/p12 \\\n"
            "      ../../aegis_static/test/AggregatedContour/extracted\n"
        ),
    )
    parser.add_argument(
        "input_dir",
        type=Path,
        help="Path to the ArcGIS vector tile cache (folder containing root.json)",
    )
    parser.add_argument(
        "output_dir",
        type=Path,
        help="Output directory where contours.pmtiles will be written",
    )
    parser.add_argument(
        "--keep-gzip",
        action="store_true",
        default=False,
        help="Keep tiles gzip-compressed (default: decompress for easy serving)",
    )
    parser.add_argument(
        "--pmtiles",
        type=Path,
        default=None,
        metavar="PATH",
        help="Override the default PMTiles output path (<output_dir>/contours.pmtiles)",
    )

    args = parser.parse_args()

    if not args.input_dir.exists():
        print(f"ERROR: input directory not found: {args.input_dir}", file=sys.stderr)
        sys.exit(1)

    decompress = not args.keep_gzip
    pmtiles_path = args.pmtiles or (args.output_dir / "contours.pmtiles")

    print("=" * 60)
    print("ArcGIS CompactV2 Bundle → PMTiles Builder")
    print("=" * 60)
    print(f"  Input:       {args.input_dir.resolve()}")
    print(f"  Output Dir:  {args.output_dir.resolve()}")
    print(f"  Decompress:  {decompress}")
    print(f"  PMTiles:     {pmtiles_path.resolve()}")
    print()

    print("-" * 60)
    print("Writing PMTiles archive...")
    print("-" * 60)
    extract_to_pmtiles(args.input_dir, pmtiles_path, decompress)

    print()
    print("Done. Serve the PMTiles archive via your dev server and point")
    print(f"PMTilesVectorSource at: {pmtiles_path.name}")


if __name__ == "__main__":
    main()
