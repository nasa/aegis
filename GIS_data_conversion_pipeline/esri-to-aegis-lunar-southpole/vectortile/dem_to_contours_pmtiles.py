#!/usr/bin/env python3
"""Generate contour-line vector tiles from a DEM as a single ``.pmtiles`` archive.

Unlike ``arcgis_cache_to_pmtiles.py`` (which *packs* a delivered ArcGIS vector-tile cache), this
script *tiles from scratch*: it runs ``gdal_contour`` over the mission DEM, cuts the resulting
lines onto the shared lunar south-pole **cap grid** with GDAL's MVT directory driver, and packs
the ``{z}/{x}/{y}.pbf`` pyramid into a clustered PMTiles archive. Each contour carries a ``label``
attribute (elevation in metres) — the generic per-feature label field the OpenLayers vector-tile
style function renders (``buildVectorStyleFn``).

Why the MVT *directory* driver and not ``-f PMTiles``/``-f MBTILES``: those GDAL drivers only
support the Web-Mercator ``GoogleMapsCompatible`` scheme and reject a custom ``TILING_SCHEME``.
The MVT dir driver honours ``TILING_SCHEME=<CRS>,<origin_ul_x>,<origin_ul_y>,<z0_tile_dim>``, so we
tile directly in the cap-grid projection with **zero reprojection**, then pack the tiles ourselves.

The producer→consumer contract is the **``esri_tile_info``** block written into the PMTiles
metadata (the OpenLayers side, ``parseEsriPmtilesMetadata`` in
``src/components/interface/map/utils/parsers/esriPMTiles.ts``, reads ``lods`` + origin/extent to
build the tile grid). Here it is **synthesized from the cap-grid constants in ``config.py``** (not
copied from a delivered ``root.json``) so it aligns pixel-for-pixel with every raster layer.

Pure-Python packing (only the ``pmtiles`` writer); the contour + tile steps shell out to the pixi
GDAL binaries, so run under ``pixi run``.

Usage
-----
    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/vectortile/dem_to_contours_pmtiles.py \\
        <dem.tif> <output_dir> --name contours_100m --interval 100 [--maxzoom 14] \\
        [--exclude-multiple-of 100]
    # -> <output_dir>/contours_100m.pmtiles
"""

from __future__ import annotations

import argparse
import json
import math
import queue
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

# Windows consoles default to cp1252; force UTF-8 so banners with →/≥ don't crash.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# config.py lives at the pipeline root (this file's parent's parent), which is NOT on
# sys.path[0] when run by path — add it before importing the shared cap-grid constants.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import (  # noqa: E402
    CAP_MAX,
    CAP_MIN,
    CAP_Z0_RES,
    TILE,
)


def default_maxzoom(dem_resolution: float) -> int:
    """Deepest cap-grid level that resolves the DEM's native resolution.

    The cap grid's zoom-z resolution is ``CAP_Z0_RES / 2**z``; the level that reaches
    ``dem_resolution`` m/px is ``log2(CAP_Z0_RES / dem_resolution)``. For a 1 mpp DEM this is
    ~13.64 → 14 (z14 ≈ 0.78 m/px, full native fidelity). Vector tiles over-zoom cleanly, so this
    is an upper bound on detail, not a hard clamp on how far the user can zoom.
    """
    res = dem_resolution if dem_resolution and dem_resolution > 0 else 1.0
    return max(1, math.ceil(math.log2(CAP_Z0_RES / res)))


def _run_logged(cmd: list[str], label: str, heartbeat: int = 30) -> int:
    """Run *cmd*, printing its stdout live and a timed heartbeat line when it is silent.

    Returns the process exit code. stderr is captured and suppressed on success (GDAL's
    benign 'Earth vs Moon' warning lives there); on failure it is written to sys.stderr.

    Pipes are drained on background threads rather than ``select`` — Windows' ``select`` only
    polls sockets, not subprocess pipe handles (``OSError: [WinError 10038]``), so a
    selector-based reader cannot work cross-platform.
    """
    print("  $ " + " ".join(cmd), flush=True)
    t0 = time.monotonic()
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert proc.stdout is not None
    assert proc.stderr is not None

    # Each reader thread pushes (is_stdout, line) onto the queue and a (is_stdout, None)
    # sentinel when its stream closes; the main loop times out to emit heartbeat lines.
    q: queue.Queue[tuple[bool, str | None]] = queue.Queue()

    def _drain(stream, is_stdout: bool) -> None:
        for line in iter(stream.readline, ""):
            q.put((is_stdout, line))
        q.put((is_stdout, None))

    readers = [
        threading.Thread(target=_drain, args=(proc.stdout, True), daemon=True),
        threading.Thread(target=_drain, args=(proc.stderr, False), daemon=True),
    ]
    for r in readers:
        r.start()

    stderr_lines: list[str] = []
    open_streams = 2
    while open_streams:
        try:
            is_stdout, line = q.get(timeout=heartbeat)
        except queue.Empty:
            # Heartbeat: no output for *heartbeat* seconds.
            elapsed = time.monotonic() - t0
            print(f"  {label} still running ... {elapsed:.0f}s", flush=True)
            continue
        if line is None:
            open_streams -= 1
            continue
        if is_stdout:
            print(line, end="", flush=True)
        else:
            stderr_lines.append(line)

    for r in readers:
        r.join()
    proc.wait()
    if proc.returncode != 0:
        for ln in stderr_lines:
            sys.stderr.write(ln)
    return proc.returncode


def run(cmd: list[str]) -> None:
    """Run a subprocess, streaming output; abort the script on failure."""
    print("  $ " + " ".join(cmd))
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        print(f"ERROR: command failed ({proc.returncode}): {cmd[0]}", file=sys.stderr)
        sys.exit(proc.returncode)


def gdal_contour(dem: Path, out_gpkg: Path, interval: float) -> None:
    """DEM → contour LineStrings (attribute ``label`` = elevation in metres) in the native CRS."""
    out_gpkg.unlink(missing_ok=True)
    cmd = [
        "gdal_contour",
        "-a",
        "label",
        "-i",
        str(interval),
        "-f",
        "GPKG",
        str(dem),
        str(out_gpkg),
        "-nln",
        "contours",
    ]
    print(
        f"  [1/3] gdal_contour: tracing contours at {interval} m interval ...",
        flush=True,
    )
    rc = _run_logged(cmd, "gdal_contour")
    if rc != 0:
        print(f"ERROR: gdal_contour failed ({rc})", file=sys.stderr)
        sys.exit(rc)


def filter_gpkg(src: Path, dst: Path, exclude_multiple_of: int) -> None:
    """Copy ``src`` → ``dst`` (GPKG→GPKG) dropping contours that are multiples of N.

    Done as a separate GPKG copy (in the source CRS, no reprojection) rather than an MVT
    ``-where`` because passing ``-where`` to the MVT driver makes GDAL eagerly compute the
    filtered extent in the MVT canonical CRS (EPSG:3857) — a lunar→Earth transform that trips
    PROJ's celestial-body guard *fatally*. Filtering first keeps the MVT step identical to the
    unfiltered (major) path, which tiles cleanly.
    """
    dst.unlink(missing_ok=True)
    cmd = [
        "ogr2ogr", "-f", "GPKG", str(dst), str(src), "contours", "-nln", "contours",
        "-where", f"CAST(label AS INTEGER) % {exclude_multiple_of} <> 0",
    ]
    print(f"  [1b/3] filter: dropping contours that are multiples of {exclude_multiple_of} m ...")
    rc = _run_logged(cmd, "ogr2ogr filter")
    if rc != 0:
        print(f"ERROR: ogr2ogr filter failed ({rc}).", file=sys.stderr)
        sys.exit(rc)


def tile_to_mvt(gpkg: Path, mvt_dir: Path, maxzoom: int) -> None:
    """Cut the contour lines onto the cap grid as an MVT ``{z}/{x}/{y}.pbf`` pyramid.

    ``TILING_SCHEME`` = ``<CRS>,<origin_upper_left_x>,<origin_upper_left_y>,<z0_tile_dim>``. The
    cap grid's zoom-0 tile spans ``TILE * CAP_Z0_RES`` metres from the top-left corner
    ``(CAP_MIN, CAP_MAX)`` — the same origin/resolution pyramid every raster layer is cut on.

    **CRS handling — the load-bearing trick.** GDAL's MVT driver assumes an Earth Web-Mercator
    tile matrix: at finalization it computes the layer's extent in EPSG:3857/WGS84 for the
    (unused) tilejson bounds. With a lunar source CRS that transform trips PROJ's "Earth vs Moon"
    celestial-body guard, which is *fatal* for large datasets (it just happens to slip through as a
    warning on small ones). So we sidestep any celestial transform entirely: **relabel** the data
    as ``EPSG:3857`` with ``-a_srs`` (a tag change, coordinates untouched) and give the tiling
    scheme the ``EPSG:3857`` CRS too. Tiling is then pure arithmetic on our lunar-metre coordinates
    against the custom origin/z0-dim — proven to yield byte-for-byte the same tile set as a lunar
    ``TILING_SCHEME`` — and finalization's Earth→WGS84 transform is valid (its bogus lat/lon
    ``bounds`` are irrelevant; OpenLayers uses the ``esri_tile_info`` we synthesize, not tilejson).
    """
    z0_tile_dim = TILE * CAP_Z0_RES
    # EPSG:3857 (not the lunar CRS): keeps GDAL's Earth-only MVT driver from ever attempting a
    # Moon↔Earth transform. Paired with -a_srs EPSG:3857 so no reprojection occurs (see docstring).
    scheme = f"EPSG:3857,{CAP_MIN},{CAP_MAX},{z0_tile_dim}"
    cmd = [
        "ogr2ogr",
        "-f",
        "MVT",
        str(mvt_dir),
        str(gpkg),
        "contours",
        "-a_srs",
        "EPSG:3857",
        "-dsco",
        f"TILING_SCHEME={scheme}",
        "-dsco",
        "MINZOOM=0",
        "-dsco",
        f"MAXZOOM={maxzoom}",
        # Dense contour sets can exceed the per-tile defaults at low zoom; raise the caps so
        # features aren't silently dropped.
        "-dsco",
        "MAX_SIZE=2000000",
        "-dsco",
        "MAX_FEATURES=500000",
    ]

    print(
        f"  [2/3] ogr2ogr MVT: cutting tiles z0–z{maxzoom} (this is the slow step) ...",
        flush=True,
    )
    rc = _run_logged(cmd, f"ogr2ogr MVT z0-z{maxzoom}")
    if rc != 0:
        print(f"ERROR: ogr2ogr MVT failed ({rc}).", file=sys.stderr)
        sys.exit(rc)


def build_esri_tile_info(maxzoom: int) -> dict:
    """Synthesize the OpenLayers tile-grid contract from the cap-grid constants."""
    lods = [{"level": z, "resolution": CAP_Z0_RES / (2**z)} for z in range(maxzoom + 1)]
    return {
        "rows": TILE,
        "cols": TILE,
        "origin": {"x": CAP_MIN, "y": CAP_MAX},
        "lods": lods,
        "minLOD": 0,
        "maxLOD": maxzoom,
        "fullExtent": {
            "xmin": CAP_MIN,
            "ymin": CAP_MIN,
            "xmax": CAP_MAX,
            "ymax": CAP_MAX,
        },
    }


def read_vector_layers(mvt_dir: Path) -> list | None:
    """Pull ``vector_layers`` (layer id/fields) from the MVT driver's metadata.json."""
    meta = mvt_dir / "metadata.json"
    if not meta.exists():
        return None
    data = json.loads(meta.read_text(encoding="utf-8"))
    inner = data.get("json")
    if not inner:
        return None
    return json.loads(inner).get("vector_layers")


def pack_pmtiles(mvt_dir: Path, out_pmtiles: Path, maxzoom: int) -> None:
    """Pack the ``{z}/{x}/{y}.pbf`` pyramid into a clustered PMTiles archive."""
    from pmtiles.tile import Compression, TileType, zxy_to_tileid
    from pmtiles.writer import Writer

    print("  [3/3] pack: scanning tiles ...", flush=True)
    tiles: list[tuple[int, bytes]] = []
    counts_by_zoom: dict[int, int] = {}
    all_pbfs = list(mvt_dir.rglob("*.pbf"))
    total = len(all_pbfs)
    report_every = max(1, total // 10)  # report every ~10%
    for i, pbf in enumerate(all_pbfs, 1):
        # Path layout is <mvt_dir>/<z>/<x>/<y>.pbf.
        z = int(pbf.parts[-3])
        x = int(pbf.parts[-2])
        y = int(pbf.stem)
        tiles.append((zxy_to_tileid(z, x, y), pbf.read_bytes()))
        counts_by_zoom[z] = counts_by_zoom.get(z, 0) + 1
        if i % report_every == 0 or i == total:
            pct = 100 * i // total
            print(f"  scanning {i:,}/{total:,} tiles ({pct}%)", flush=True)

    if not tiles:
        print("ERROR: no MVT tiles produced — nothing to pack.", file=sys.stderr)
        sys.exit(1)

    for z in sorted(counts_by_zoom):
        print(f"  z{z:<2} {counts_by_zoom[z]:>8,} tiles")

    print(f"  sorting {len(tiles):,} tiles ...", flush=True)
    tiles.sort(key=lambda t: t[0])

    # GDAL's MVT driver gzips tiles by default; reflect what we actually wrote so the PMTiles
    # client decompresses correctly (sampled from the first tile's magic bytes).
    tile_compression = Compression.NONE
    if tiles[0][1][:2] == b"\x1f\x8b":
        tile_compression = Compression.GZIP

    metadata: dict = {"esri_tile_info": build_esri_tile_info(maxzoom)}
    vector_layers = read_vector_layers(mvt_dir)
    if vector_layers:
        metadata["vector_layers"] = vector_layers

    out_pmtiles.parent.mkdir(parents=True, exist_ok=True)
    print(f"  writing {out_pmtiles.name} ...")
    with open(out_pmtiles, "wb") as f:
        writer = Writer(f)
        for tid, data in tiles:
            writer.write_tile(tid, data)
        writer.finalize(
            {"tile_type": TileType.MVT, "tile_compression": tile_compression}, metadata
        )

    size_mb = out_pmtiles.stat().st_size / (1024 * 1024)
    print(f"\n  {len(tiles):,} tiles → {out_pmtiles}  ({size_mb:.1f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("dem", type=Path, help="DEM GeoTIFF path.")
    parser.add_argument("output_dir", type=Path, help="Output Layers/<name>/ folder.")
    parser.add_argument(
        "--name",
        default="contours",
        help="Archive base name → <output_dir>/<name>.pmtiles (default: contours).",
    )
    parser.add_argument(
        "--interval", type=float, required=True, help="Contour interval in metres."
    )
    parser.add_argument(
        "--maxzoom",
        type=int,
        default=None,
        help="Deepest cap-grid LOD to tile (default: derived from --dem-resolution).",
    )
    parser.add_argument(
        "--dem-resolution",
        type=float,
        default=1.0,
        help="DEM native resolution m/px, used to derive --maxzoom (default: 1.0).",
    )
    parser.add_argument(
        "--exclude-multiple-of",
        type=int,
        default=None,
        metavar="N",
        help="Drop contours whose elevation is a multiple of N (minor set excludes majors).",
    )
    args = parser.parse_args()

    if not args.dem.exists():
        print(f"ERROR: DEM not found: {args.dem}", file=sys.stderr)
        sys.exit(1)

    maxzoom = (
        args.maxzoom
        if args.maxzoom is not None
        else default_maxzoom(args.dem_resolution)
    )
    out_pmtiles = args.output_dir / f"{args.name}.pmtiles"

    print("=" * 60)
    print("DEM → contour lines → cap-grid MVT → PMTiles")
    print("=" * 60)
    print(f"  dem         {args.dem.resolve()}")
    print(f"  output      {out_pmtiles.resolve()}")
    print(f"  interval    {args.interval} m")
    print(f"  maxzoom     {maxzoom}")
    if args.exclude_multiple_of:
        print(f"  exclude     multiples of {args.exclude_multiple_of} m")
    print()

    with tempfile.TemporaryDirectory(prefix="contours_") as tmp:
        tmp_path = Path(tmp)
        gpkg = tmp_path / "contours.gpkg"
        mvt_dir = tmp_path / "mvt"
        gdal_contour(args.dem, gpkg, args.interval)
        tile_src = gpkg
        if args.exclude_multiple_of:
            filtered = tmp_path / "contours_filtered.gpkg"
            filter_gpkg(gpkg, filtered, args.exclude_multiple_of)
            tile_src = filtered
        tile_to_mvt(tile_src, mvt_dir, maxzoom)
        pack_pmtiles(mvt_dir, out_pmtiles, maxzoom)


if __name__ == "__main__":
    main()
