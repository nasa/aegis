"""Pipeline step functions, their helpers, and the step registry.

Each ``step_*`` takes ``(p: config.PipelinePaths, args: argparse.Namespace)``. Steps shell out
to the per-concern sub-scripts via :func:`pipeline.reporting.run` (so the pixi env is
inherited and output is captured). The registry (``STEPS``/``STEP_FNS``) and the
input-driven :func:`default_steps` are consumed by ``main.py``.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import config
from pipeline.reporting import banner, run, tee

# Same interpreter that runs main.py → sub-scripts inherit the pixi/uv environment.
PYTHON = sys.executable

# Sub-script locations (esri-to-aegis-lunar-southpole/ is this file's parent's parent).
ROOT = Path(__file__).resolve().parent.parent
GEOTIFF_TO_COG = ROOT / "common" / "geotiff_to_cog.py"
TILE_TO_CAP_GRID = ROOT / "common" / "tile_to_cap_grid.py"
STRETCH_TO_8BIT = ROOT / "nac" / "stretch_to_8bit.py"
COLORIZE_SLOPE = ROOT / "slope" / "colorize_slope.py"
SHP_TO_GEOJSON = ROOT / "vector" / "shp_to_geojson.py"
DEM_PRODUCTS = ROOT / "products" / "dem_products.py"
LYRX_TO_RAMP = ROOT / "products" / "lyrx_to_ramp.py"
WRITE_PROPERTIES = ROOT / "properties" / "write_properties.py"
GENERATE_LGRS = ROOT / "grid" / "generate_lgrs.py"
CONVERT_LGRS = ROOT / "grid" / "convert_lgrs.py"
ARCGIS_CACHE_TO_PMTILES = ROOT / "vectortile" / "arcgis_cache_to_pmtiles.py"
DEM_TO_CONTOURS_PMTILES = ROOT / "vectortile" / "dem_to_contours_pmtiles.py"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def require_input(path: Path, what: str, flag: str) -> None:
    """Exit with a helpful message if a required input is missing."""
    if not path.exists():
        tee(
            f"\nERROR: {what} not found:\n  {path}\n"
            f"Pass {flag} or fix --src so it points at the data drop.",
            file=sys.stderr,
        )
        sys.exit(1)


def clear_layer_dir(layer_dir: Path, overwrite: bool) -> bool:
    """If a layer already exists, remove it (overwrite) or report skip. Returns proceed?"""
    if layer_dir.exists() and (layer_dir / "tilemapresource.xml").exists():
        if not overwrite:
            tee(f"  [skip] {layer_dir} already built (use --overwrite to rebuild)")
            return False
        tee(f"  [overwrite] removing existing layer dir {layer_dir}")
        shutil.rmtree(layer_dir)
    return True


def is_uint8(raster: Path) -> bool:
    """True if the raster's first band is already 8-bit (so it needs no stretch).

    Falls back to False (stretch it) if rasterio isn't importable or the file won't open.
    """
    try:
        import rasterio  # imported lazily; only needed for the dtype check
    except ImportError:
        return False
    try:
        with rasterio.open(raster) as src:
            return str(src.dtypes[0]) == "uint8"
    except Exception:
        return False


def write_properties(
    layer_dir: Path,
    processing: str,
    name: str,
    *,
    ramp: Path | None = None,
    units: str | None = None,
) -> None:
    """Write an AEGIS properties.json into a tile-layer dir (legend from a colour ramp)."""
    cmd: list[str | Path] = [
        PYTHON,
        WRITE_PROPERTIES,
        "--processing",
        processing,
        "--name",
        name,
        "--out",
        layer_dir / "properties.json",
    ]
    if ramp is not None:
        cmd += ["--ramp", ramp]
    if units is not None:
        cmd += ["--units", units]
    run(cmd)


def tile_raster_to_layer(
    p: config.PipelinePaths,
    raster: Path,
    layer_dir: Path,
    name: str,
    processing: str,
    overwrite: bool,
) -> None:
    """Tile one raster onto the cap grid (stretching float input to 8-bit first)."""
    if not clear_layer_dir(layer_dir, overwrite):
        return
    if is_uint8(raster):
        tee(f"  {raster.name} is already 8-bit — tiling directly (no stretch)")
        run([PYTHON, TILE_TO_CAP_GRID, raster, layer_dir])
        write_properties(layer_dir, processing, name)
        return

    scratch = p.out / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    stretched = scratch / f"{layer_dir.name}_8bit.tif"
    try:
        run(
            [
                PYTHON,
                STRETCH_TO_8BIT,
                raster,
                stretched,
                "--pct-low",
                "2",
                "--pct-high",
                "98",
                "--nodata",
                "-3.4e38",
            ]
        )
        run([PYTHON, TILE_TO_CAP_GRID, stretched, layer_dir])
        write_properties(layer_dir, processing, name)
    finally:
        stretched.unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Steps
# ---------------------------------------------------------------------------


def step_stage(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Remove ArcGIS .sr.lock files near the inputs; create output folders."""
    banner("stage — clean & create output folders")
    lock_dir = p.ellipse_shp.parent
    if lock_dir.exists():
        for lock in lock_dir.glob("*.sr.lock"):
            tee(f"  removing {lock}")
            lock.unlink()
    for folder in (p.layers, p.data):
        folder.mkdir(parents=True, exist_ok=True)
        tee(f"  mkdir {folder}")


def step_dem(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Re-emit the DEM GeoTIFF as a clean COG for the mission demFilePath."""
    banner("dem — DEM GeoTIFF → clean COG (demFilePath)")
    require_input(p.dem_in, "DEM GeoTIFF", "--in-dem")
    p.data.mkdir(parents=True, exist_ok=True)
    run(
        [
            PYTHON,
            GEOTIFF_TO_COG,
            p.dem_in,
            "--compress",
            config.DEM_COMPRESS,
            "-o",
            p.dem_out,
        ]
    )


def step_nac(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """NAC mosaic → (stretch if float) → tile to one cap-grid layer."""
    banner("nac — NAC mosaic → cap-grid tile layer")
    require_input(p.nac_mosaic, "NAC mosaic raster", "--in-nac")
    tile_raster_to_layer(
        p,
        p.nac_mosaic,
        p.nac_layer,
        p.layer_name(config.OUT_NAC_LAYER_NAME),
        "nac",
        args.overwrite,
    )


def slope_ramp(p: config.PipelinePaths, scratch: Path) -> Path:
    """Resolve the slope colour ramp: GIS-delivered .lyrx symbology > built-in default.

    When a slope ``.lyrx`` is present (``--lyrx`` / the configured path), it is converted to a
    gdaldem ramp via ``lyrx_to_ramp.py`` and used instead of ``default_color_ramps/slope.txt``.
    """
    if p.lyrx.exists():
        ramp = scratch / "slope_from_lyrx.txt"
        run([PYTHON, LYRX_TO_RAMP, p.lyrx, "-o", ramp])
        tee(f"  slope: using provided GIS symbology {p.lyrx.name}")
        return ramp
    return config.DEFAULT_COLOR_RAMPS_DIR / "slope.txt"


def step_slope(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Slope float raster → colorize (lyrx ramp) → tile to one cap-grid layer."""
    banner("slope — slope float → colorize → cap-grid tile layer")
    require_input(p.slope_in, "slope raster", "--in-slope")
    if not clear_layer_dir(p.slope_layer, args.overwrite):
        return

    scratch = p.out / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    colorize_cmd: list[str | Path] = [PYTHON, COLORIZE_SLOPE, p.slope_in, p.slope_rgba]
    if p.lyrx.exists():
        colorize_cmd += ["--lyrx", p.lyrx]
    else:
        tee(f"  (no --lyrx at {p.lyrx}; colorize_slope will auto-detect next to input)")
    try:
        run(colorize_cmd)
        run([PYTHON, TILE_TO_CAP_GRID, p.slope_rgba, p.slope_layer])
        # Legend mirrors the colour treatment actually applied (lyrx symbology if provided).
        write_properties(
            p.slope_layer,
            "slope",
            p.layer_name(config.OUT_SLOPE_LAYER_NAME),
            ramp=slope_ramp(p, scratch),
            units=config.PRODUCT_UNITS["slope"],
        )
    finally:
        p.slope_rgba.unlink(missing_ok=True)
        for leftover in scratch.glob("*.txt"):
            leftover.unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass


def _cog_layer_needs_build(layer_dir: Path, name: str, overwrite: bool) -> bool:
    """True if the COG product layer should be (re)built. Mirrors the skip/overwrite logic for tile layers."""
    out_cog = layer_dir / config.cog_layer_filename(name)
    if out_cog.exists():
        if not overwrite:
            tee(f"  [skip] {out_cog} already built (use --overwrite to rebuild)")
            return False
        tee(f"  [overwrite] removing existing COG {out_cog}")
        out_cog.unlink()
    return True


def step_products(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Derive standardized products from the DEM → colorize → tile or COG (one layer each).

    Which products to build comes from ``--dem-products`` (default ``config.PRODUCTS_DEFAULT`` =
    hillshade/aspect/tri; pass ``--dem-products hillshade slope aspect tri`` to also derive slope
    from the DEM when no GIS-delivered slope raster is available). The TRI colour ramp is
    chosen to match ``--dem-resolution`` so its legend bins are correct.

    With ``--dem-products-as-cog`` the colorized rasters are converted to Cloud-Optimised GeoTIFFs
    in ``Layers/<name>/<name>_cog.tif`` instead of being tiled — OL renders them directly via HTTP
    Range with no tile pyramid.
    """
    products = args.dem_products or config.PRODUCTS_DEFAULT
    as_cog = args.dem_products_as_cog
    output_kind = "COG" if as_cog else "cap-grid tile layers"
    banner(f"products — DEM → {'/'.join(products)} → {output_kind}")
    require_input(p.dem_in, "DEM GeoTIFF", "--in-dem")

    layer_name = {
        "hillshade": config.OUT_HILLSHADE_LAYER_NAME,
        "aspect": config.OUT_ASPECT_LAYER_NAME,
        "tri": config.OUT_TRI_LAYER_NAME,
        "slope": config.OUT_SLOPE_LAYER_NAME,
    }

    # Rebuild only what's missing (or everything with --overwrite): dem_products on a
    # large DEM is expensive, so don't derive products whose layer is already built.
    if as_cog:
        to_build = [
            pr
            for pr in products
            if _cog_layer_needs_build(
                p.layer_path(layer_name[pr]),
                p.layer_name(layer_name[pr]),
                args.overwrite,
            )
        ]
    else:
        to_build = [
            pr
            for pr in products
            if clear_layer_dir(p.layer_path(layer_name[pr]), args.overwrite)
        ]
    if not to_build:
        tee("  all requested product layers already built — nothing to do")
        return

    scratch = p.out / "scratch_products"
    scratch.mkdir(parents=True, exist_ok=True)
    try:
        # Per-product colour ramp (None = no legend for hillshade). slope honours
        # GIS-delivered .lyrx symbology when present; TRI is resolution-matched. The SAME
        # ramp drives both the gdaldem colorize (dem_products) and the AEGIS legend
        # (write_properties). Resolved lazily so the .lyrx conversion only runs when slope
        # is actually being built.
        ramp_resolvers = {
            "hillshade": lambda: None,
            "slope": lambda: slope_ramp(p, scratch),
            "aspect": lambda: config.DEFAULT_COLOR_RAMPS_DIR / "aspect.txt",
            "tri": lambda: config.tri_ramp_for_resolution(args.dem_resolution),
        }
        ramp_for = {product: ramp_resolvers[product]() for product in to_build}

        dem_cmd: list[str | Path] = [
            PYTHON,
            DEM_PRODUCTS,
            "--dem",
            p.dem_in,
            "--out",
            scratch,
            "--products",
            *to_build,
        ]
        for product in to_build:
            if ramp_for[product] is not None:
                dem_cmd += [f"--{product}-ramp", ramp_for[product]]
        run(dem_cmd)

        for i, product in enumerate(to_build):
            lname = p.layer_name(layer_name[product])
            layer_dir = p.layer_path(layer_name[product])
            layer_dir.mkdir(parents=True, exist_ok=True)
            src_tif = scratch / f"{product}.tif"

            if as_cog:
                out_cog = layer_dir / config.cog_layer_filename(lname)
                tee(f"\n  COG product {i + 1}/{len(to_build)}: {product} → {out_cog}")
                # OL-rendered COG: browser-decodable codec (config.COG_COMPRESS = deflate).
                run(
                    [
                        PYTHON,
                        GEOTIFF_TO_COG,
                        src_tif,
                        "-o",
                        out_cog,
                        "--compress",
                        config.COG_COMPRESS,
                    ]
                )
            else:
                tee(
                    f"\n  tiling product {i + 1}/{len(to_build)}: {product} → {layer_dir}"
                )
                run([PYTHON, TILE_TO_CAP_GRID, src_tif, layer_dir])

            write_properties(
                layer_dir,
                product,
                lname,
                ramp=ramp_for[product],
                units=config.PRODUCT_UNITS.get(product),
            )
    finally:
        for product in products:
            (scratch / f"{product}.tif").unlink(missing_ok=True)
        for leftover in scratch.glob("*.txt"):
            leftover.unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass


def step_vector(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Landing-ellipse shapefile → GeoJSON (EPSG:4326)."""
    banner("vector — ellipse shapefile → GeoJSON")
    require_input(p.ellipse_shp, "ellipse shapefile", "--in-ellipse")
    p.data.mkdir(parents=True, exist_ok=True)
    run([PYTHON, SHP_TO_GEOJSON, p.ellipse_shp, p.ellipse_out, "--to-epsg", "4326"])


def step_rasters(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Custom raster layers (--raster) → one cap-grid tile layer each (Layers/<stem>)."""
    banner("rasters — custom rasters → cap-grid tile layers")
    for raster in args.in_raster:
        raster = Path(raster)
        require_input(raster, "custom raster", "--in-raster")
        layer_dir = p.layer_path(raster.stem)
        tee(f"\n  raster: {raster}  → {layer_dir}")
        tile_raster_to_layer(
            p, raster, layer_dir, p.layer_name(raster.stem), "source", args.overwrite
        )


def step_vectors(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Custom vector layers (--vector) → GeoJSON in Data/ (shp converted, geojson copied)."""
    banner("vectors — custom vectors → GeoJSON in Data/")
    p.data.mkdir(parents=True, exist_ok=True)
    for vector in args.in_vector:
        vector = Path(vector)
        require_input(vector, "custom vector", "--in-vector")
        out = p.data / f"{vector.stem}.geojson"
        suffix = vector.suffix.lower()
        if suffix == ".shp":
            run([PYTHON, SHP_TO_GEOJSON, vector, out, "--to-epsg", "4326"])
        elif suffix in (".geojson", ".json"):
            tee(f"  copying {vector} → {out}")
            shutil.copyfile(vector, out)
        else:
            tee(f"  [skip] unsupported vector format: {vector}", file=sys.stderr)


def step_grid(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """LGRS mission grid from the lander location → AEGIS grid GeoJSON (default 10 km square)."""
    banner(
        f"grid — LGRS grid ({args.grid_extent}, {args.grid_precision} m) → AEGIS GeoJSON"
    )
    if args.lander_lat is None or args.lander_lng is None:
        tee(
            "  [skip] grid needs --lander-lat/--lander-lng (lander location).",
            file=sys.stderr,
        )
        return

    grid_out = p.out / config.OUT_GRID_SOURCE_NAME
    scratch = p.out / "scratch_grid"
    scratch.mkdir(parents=True, exist_ok=True)
    raw = scratch / "raw_grid.geojson"
    try:
        run(
            [
                PYTHON,
                GENERATE_LGRS,
                "--lat",
                str(args.lander_lat),
                "--lng",
                str(args.lander_lng),
                "--extent",
                args.grid_extent,
                "--precision",
                str(args.grid_precision),
                "-o",
                raw,
            ]
        )
        run([PYTHON, CONVERT_LGRS, raw, "-o", scratch])
        cleaned = scratch / f"Cleaned_{raw.stem}.geojson"
        if not cleaned.exists():
            tee(
                f"  ERROR: expected converted grid not found: {cleaned}",
                file=sys.stderr,
            )
            sys.exit(1)
        shutil.move(str(cleaned), str(grid_out))
        tee(f"  grid → {grid_out}")
    finally:
        raw.unlink(missing_ok=True)
        for leftover in scratch.glob("*.geojson"):
            leftover.unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass


def _pmtiles_name(cache_dir: Path) -> str:
    """Pick a meaningful output name for a delivered ArcGIS cache.

    The cache leaf is often a generic level dir (``p12``); prefer the parent name in that case
    (e.g. ``AggregatedContour/p12`` → ``AggregatedContour``).
    """
    leaf = cache_dir.name
    if re.fullmatch(r"p\d+", leaf) or leaf in ("tile", "cache"):
        return cache_dir.parent.name or leaf
    return leaf


def step_vectortiles(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """ArcGIS vector-tile caches (--in-esri-vector-tiles) → one Layers/<name>/<name>.pmtiles each.

    Each archive lands inside its own folder under Layers/ so it is managed exactly like a raster
    tile-layer folder (upload/rename/delete as a unit). AEGIS resolves the "vector-tile" sublayer's
    PMTiles URL via the Layers/ subdir. The converter copies the cache's esri_tile_info into the
    archive so OpenLayers can build the vector tile grid with no reprojection.
    """
    banner(
        "vectortiles — ArcGIS vector-tile cache → PMTiles (Layers/<name>/<name>.pmtiles)"
    )
    p.layers.mkdir(parents=True, exist_ok=True)
    for cache in args.in_esri_vector_tiles:
        cache = Path(cache)
        require_input(
            cache / "root.json",
            "ArcGIS vector-tile cache (root.json)",
            "--in-esri-vector-tiles",
        )
        name = p.layer_name(_pmtiles_name(cache))
        layer_dir = p.layers / name
        out_pmtiles = layer_dir / f"{name}.pmtiles"
        if out_pmtiles.exists() and not args.overwrite:
            tee(f"  [skip] {out_pmtiles} already built (use --overwrite to rebuild)")
            continue
        layer_dir.mkdir(parents=True, exist_ok=True)
        tee(f"\n  cache: {cache}  → {out_pmtiles}")
        run([PYTHON, ARCGIS_CACHE_TO_PMTILES, cache, layer_dir, "--name", name])


def _write_contour_properties(
    layer_dir: Path, name: str, interval: int, kind: str
) -> None:
    """Write a minimal properties.json (name/description) for a contour PMTiles layer.

    register.py's ``_apply_properties`` reads only name/description/legend onto the
    self-describing vector-tile sublayer, so we emit just those schema-allowed keys.
    """
    props = {
        "name": name,
        "description": (
            f"Elevation contour lines at a {interval} m interval ({kind}), derived from the "
            "mission DEM. Each line is labelled with its elevation in metres."
        ),
    }
    (layer_dir / "properties.json").write_text(
        json.dumps(props, indent=2) + "\n", encoding="utf-8"
    )


def _build_contour_layer(
    p: config.PipelinePaths,
    args: argparse.Namespace,
    interval: int,
    kind: str,
    exclude_multiple_of: int | None,
) -> None:
    """Generate one contour PMTiles sublayer (Layers/contours_<interval>m/)."""
    name = p.layer_name(config.contour_layer_name(interval))
    layer_dir = p.layers / name
    out_pmtiles = layer_dir / f"{name}.pmtiles"
    if out_pmtiles.exists() and not args.overwrite:
        tee(f"  [skip] {out_pmtiles} already built (use --overwrite to rebuild)")
        return
    layer_dir.mkdir(parents=True, exist_ok=True)
    tee(f"\n  {kind} contours ({interval} m) → {out_pmtiles}")
    cmd: list[str | Path] = [
        PYTHON,
        DEM_TO_CONTOURS_PMTILES,
        p.dem_in,
        layer_dir,
        "--name",
        name,
        "--interval",
        str(interval),
        "--dem-resolution",
        str(args.dem_resolution),
    ]
    if args.contours_maxzoom is not None:
        cmd += ["--maxzoom", str(args.contours_maxzoom)]
    if exclude_multiple_of:
        cmd += ["--exclude-multiple-of", str(exclude_multiple_of)]
    run(cmd)
    display = f"Contours ({interval} m)"
    if p.layer_prefix:
        display = f"{p.layer_prefix} {display}"
    _write_contour_properties(layer_dir, display, interval, kind)


def step_contours(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """DEM → major + minor contour PMTiles (Layers/contours_<interval>m/<name>.pmtiles each).

    Two sublayers are produced so majors/minors can be styled independently in AEGIS: a coarse
    ``--contours-major`` set and a fine ``--contours-minor`` set (which excludes the major lines
    so coincident intervals aren't double-drawn). Each carries an ``elev`` attribute that the
    OpenLayers vector-tile style function renders as an elevation label.
    """
    banner(
        "contours — DEM → major/minor contour PMTiles (Layers/contours_<interval>m/)"
    )
    require_input(p.dem_in, "DEM GeoTIFF", "--in-dem")
    p.layers.mkdir(parents=True, exist_ok=True)

    major = args.contours_major
    minor = args.contours_minor
    if major and major > 0:
        _build_contour_layer(p, args, major, "major", exclude_multiple_of=None)
    if minor and minor > 0 and minor != major:
        # Minor set excludes lines that coincide with the major interval.
        _build_contour_layer(p, args, minor, "minor", exclude_multiple_of=major)


def step_cogs(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Custom rasters (--in-cog) → one Cloud-Optimised GeoTIFF each in Layers/<stem>/<stem>_cog.tif.

    Additive OpenLayers-first output: OL renders a COG directly (WebGLTile + GeoTIFF over HTTP
    Range) with no tile pyramid. Each COG lands inside its own Layers/ folder so it is managed like
    any other layer; the register step detects it as a COG raster sublayer from the .tif inside.
    (The mission DEM COG is separate — it stays in Data/ as demFilePath, see step_dem.)
    """
    banner(
        "cogs — custom rasters → Cloud-Optimised GeoTIFF (Layers/<stem>/<stem>_cog.tif)"
    )
    p.layers.mkdir(parents=True, exist_ok=True)
    for raster in args.in_cog:
        raster = Path(raster)
        require_input(raster, "COG source raster", "--in-cog")
        layer_dir = p.layer_path(raster.stem)
        out_cog = layer_dir / config.cog_layer_filename(raster.stem)
        if out_cog.exists() and not args.overwrite:
            tee(f"  [skip] {out_cog} already built (use --overwrite to rebuild)")
            continue
        layer_dir.mkdir(parents=True, exist_ok=True)
        tee(f"\n  raster: {raster}  → {out_cog}")
        # OL-rendered COG: browser-decodable codec (config.COG_COMPRESS = deflate).
        cmd: list[str | Path] = [
            PYTHON,
            GEOTIFF_TO_COG,
            raster,
            "-o",
            out_cog,
            "--compress",
            config.COG_COMPRESS,
        ]
        if args.in_cog_nodata is not None:
            cmd += ["--nodata", str(args.in_cog_nodata)]
        run(cmd)


def step_register(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Register mission fields + header layers + sublayers + active grid on the AEGIS server."""
    banner("register — AEGIS mission fields + layers + sublayers + grid")
    if args.mission_id is None:
        tee("ERROR: --mission-id is required for the register step.", file=sys.stderr)
        sys.exit(1)

    from aegis_api import AegisApiClient, load_token
    from register import build_mission_fields, find_dem_file, register_mission

    token = args.token or load_token()
    if not token:
        tee(
            "ERROR: no EMSS token (pass --token or set EMSS_TOKEN in .env)",
            file=sys.stderr,
        )
        sys.exit(1)

    # demFilePath reflects the actual COG in Data/ (keeps the source filename). With
    # --dem-products-only the DEM is products-only, so leave demFilePath/demResolution untouched.
    if args.dem_products_only:
        dem_rel = None
        dem_resolution = None
    else:
        dem_file = find_dem_file(p.data)
        dem_rel = f"{config.OUT_DATA_DIRNAME}/{dem_file.name}" if dem_file else None
        dem_resolution = args.dem_resolution
    mission_fields = None
    if not args.register_no_mission_fields:
        mission_fields = build_mission_fields(
            name=args.mission_name,
            lander_lat=args.lander_lat,
            lander_lng=args.lander_lng,
            dem_rel_path=dem_rel,
            dem_resolution=dem_resolution,
        )

    grid_geojson = (
        None if args.register_no_grid else (p.out / config.OUT_GRID_SOURCE_NAME)
    )

    client = AegisApiClient(args.aegis_url, token)
    register_mission(
        client,
        mission_id=args.mission_id,
        out_dir=p.out,
        mission_fields=mission_fields,
        include_external_nac=not args.register_no_external_nac,
        grid_geojson=grid_geojson,
        dry_run=args.dry_run,
    )


def step_box(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Zip Data/ + each Layers/<dir> and upload to Box under the mission name."""
    banner("box — zip & upload to Box")
    if not args.mission_name:
        tee("ERROR: --mission-name is required for the box step.", file=sys.stderr)
        sys.exit(1)
    if args.dry_run:
        tee("  [dry-run] skipping Box upload.")
        return

    from box_publish import upload_mission_folder

    upload_mission_folder(
        out_dir=p.out,
        mission_name=args.mission_name,
        overwrite=True,
        max_workers=args.box_workers,
    )


# ---------------------------------------------------------------------------
# Step registry
# ---------------------------------------------------------------------------

STEPS: list[tuple[str, str]] = [
    ("stage", "Remove .sr.lock files; create Layers/ and Data/"),
    ("dem", "DEM GeoTIFF → clean COG (demFilePath)"),
    ("nac", "NAC mosaic → stretch (if float) → tile to one cap-grid layer"),
    ("slope", "Slope float → colorize → tile to one cap-grid layer"),
    (
        "products",
        "DEM → hillshade/aspect/tri → colorize → tile or COG (one layer each; --dem-products-as-cog for COG)",
    ),
    ("vector", "Landing-ellipse shapefile → GeoJSON"),
    ("rasters", "Custom rasters (--in-raster) → tile to one cap-grid layer each"),
    ("vectors", "Custom vectors (--in-vector, shp/geojson) → GeoJSON in Data/"),
    (
        "vectortiles",
        "ArcGIS vector-tile caches (--in-esri-vector-tiles) → Layers/<name>/<name>.pmtiles",
    ),
    ("contours", "DEM → major/minor contour PMTiles (Layers/contours_<interval>m)"),
    (
        "cogs",
        "Custom rasters (--in-cog) → Cloud-Optimised GeoTIFF in Layers/<stem>/<stem>_cog.tif",
    ),
    ("grid", "Lander location → LGRS mission grid GeoJSON (default 10km)"),
    (
        "register",
        "Set mission fields + header layers/sublayers + active grid via AEGIS API",
    ),
    ("box", "Zip Data/ + each layer and upload to Box"),
]

STEP_FNS = {
    "stage": step_stage,
    "dem": step_dem,
    "nac": step_nac,
    "slope": step_slope,
    "products": step_products,
    "vector": step_vector,
    "rasters": step_rasters,
    "vectors": step_vectors,
    "vectortiles": step_vectortiles,
    "contours": step_contours,
    "cogs": step_cogs,
    "grid": step_grid,
    "register": step_register,
    "box": step_box,
}

STEP_NAMES = [name for name, _ in STEPS]

# Steps that produce files under <out> (vs. publish-only steps that need <out> to exist).
DATA_STEPS = {
    "stage",
    "dem",
    "nac",
    "slope",
    "products",
    "vector",
    "rasters",
    "vectors",
    "vectortiles",
    "contours",
    "cogs",
    "grid",
}


def default_steps(args: argparse.Namespace, p: config.PipelinePaths) -> list[str]:
    """Choose steps from the inputs actually provided (+ opt-in publish flags).

    Avoids hard-failing on a generic mission that only supplies some inputs.
    """
    chosen = ["stage"]
    if p.dem_in.exists():
        # --dem-products-only: derive products from the DEM but don't emit the mission DEM COG.
        chosen += ["products"] if args.dem_products_only else ["dem", "products"]
    if p.nac_mosaic.exists():
        chosen.append("nac")
    if p.slope_in.exists():
        chosen.append("slope")
    if p.ellipse_shp.exists():
        chosen.append("vector")
    if args.in_raster:
        chosen.append("rasters")
    if args.in_vector:
        chosen.append("vectors")
    if args.in_esri_vector_tiles:
        chosen.append("vectortiles")
    if args.contours and p.dem_in.exists():
        chosen.append("contours")
    if args.in_cog:
        chosen.append("cogs")
    if (
        getattr(args, "grid", False)
        and args.lander_lat is not None
        and args.lander_lng is not None
    ):
        chosen.append("grid")
    if args.register:
        chosen.append("register")
    if args.box:
        chosen.append("box")
    return [n for n in STEP_NAMES if n in set(chosen)]  # canonical order


def resolve_step_tokens(tokens: list[str]) -> list[str]:
    """Map CLI --steps tokens (names or numeric indices) to canonical step names."""
    chosen: list[str] = []
    for tok in tokens:
        if tok.isdigit():
            idx = int(tok)
            if 0 <= idx < len(STEP_NAMES):
                chosen.append(STEP_NAMES[idx])
            else:
                raise SystemExit(f"Unknown step index: {tok}. Use --list.")
        elif tok in STEP_FNS:
            chosen.append(tok)
        else:
            raise SystemExit(f"Unknown step: {tok!r}. Use --list.")
    return [n for n in STEP_NAMES if n in set(chosen)]
