#!/usr/bin/env python3
"""ESRI/ArcGIS → AEGIS lunar south-pole data-processing pipeline.

Turns an ArcGIS/ESRI GIS data drop into AEGIS-ready map products. There are only
four kinds of data to process, each handled by its own folder:

    dem     DEM GeoTIFF        → clean COG for the mission demFilePath (Data/)
    nac     NAC mosaic raster  → one cap-grid tile layer                (Layers/)
    slope   slope float raster → colorize → one cap-grid tile layer     (Layers/)
    vector  ellipse shapefile  → GeoJSON                                (Data/)

There are **no mission numbers** here — the output root is the per-environment knob.
All paths and the cap-grid projection profile live in ``config.py``; the shared
tiler is ``common/tile_to_cap_grid.py``.

Run from the parent ``data_conversion_scripts/`` directory via pixi so the GDAL /
rasterio stack is on PATH:

    cd data_conversion_scripts
    pixi run python esri-to-aegis-lunar-southpole/main.py --out F:/_repos/aegis_static/<env> \\
        --nac-mosaic F:/path/to/nac_mosaic.tif
    pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --steps dem vector
    pixi run python esri-to-aegis-lunar-southpole/main.py --list
    pixi run python esri-to-aegis-lunar-southpole/main.py --out <dir> --summary

NOTE: the per-frame "one layer per NAC frame" flow is a preserved EXAMPLE only and
is not part of this pipeline — see ``nac/examples/per_frame_layers/``.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path

import config

# Always invoke sub-scripts with the same interpreter running this file, so the
# pixi/uv environment (rasterio, numpy, PIL, fiona, …) is inherited.
PYTHON = sys.executable

# Windows consoles default to cp1252, which can't encode the "→" in banners.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

# ---------------------------------------------------------------------------
# Script locations (relative to this file)
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
GEOTIFF_TO_COG = ROOT / "common" / "geotiff_to_cog.py"
TILE_TO_CAP_GRID = ROOT / "common" / "tile_to_cap_grid.py"
STRETCH_TO_8BIT = ROOT / "nac" / "stretch_to_8bit.py"
COLORIZE_SLOPE = ROOT / "slope" / "colorize_slope.py"
SHP_TO_GEOJSON = ROOT / "vector" / "shp_to_geojson.py"
DEM_PRODUCTS = ROOT / "products" / "dem_products.py"
WRITE_PROPERTIES = ROOT / "properties" / "write_properties.py"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def run(cmd: list[str | Path], *, check: bool = True) -> int:
    """Print and execute a command, forcing UTF-8 in the child process."""
    printable = " ".join(str(a) for a in cmd)
    print(f"\n$ {printable}")
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"}
    return subprocess.run([str(a) for a in cmd], check=check, env=env).returncode


def banner(title: str) -> None:
    width = 70
    print("\n" + "=" * width)
    print(f"  {title}")
    print("=" * width)


def require_input(path: Path, what: str, flag: str) -> None:
    """Exit with a helpful message if a required input is missing."""
    if not path.exists():
        print(
            f"\nERROR: {what} not found:\n  {path}\n"
            f"Pass {flag} or fix --src so it points at the data drop.",
            file=sys.stderr,
        )
        sys.exit(1)


def clear_layer_dir(layer_dir: Path, overwrite: bool) -> bool:
    """If a layer already exists, remove it (overwrite) or report skip.

    Returns True to proceed with (re)building, False to skip.
    """
    if layer_dir.exists() and (layer_dir / "tilemapresource.xml").exists():
        if not overwrite:
            print(f"  [skip] {layer_dir} already built (use --overwrite to rebuild)")
            return False
        print(f"  [overwrite] removing existing layer dir {layer_dir}")
        shutil.rmtree(layer_dir)
    return True


def is_uint8(raster: Path) -> bool:
    """True if the raster's first band is already 8-bit (so it needs no stretch).

    Falls back to False (i.e. "stretch it") if rasterio isn't importable or the
    file can't be opened — stretching is the safe default for float NAC input.
    """
    try:
        import rasterio  # imported lazily; only needed for the NAC dtype check
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
        PYTHON, WRITE_PROPERTIES,
        "--processing", processing,
        "--name", name,
        "--out", layer_dir / "properties.json",
    ]
    if ramp is not None:
        cmd += ["--ramp", ramp]
    if units is not None:
        cmd += ["--units", units]
    run(cmd)


# ---------------------------------------------------------------------------
# Steps  (each takes the resolved paths + the overwrite flag)
# ---------------------------------------------------------------------------


def step_stage(p: config.PipelinePaths, overwrite: bool) -> None:
    """Remove ArcGIS .sr.lock files near the inputs; create output folders."""
    banner("stage — clean & create output folders")
    lock_dir = p.ellipse_shp.parent
    if lock_dir.exists():
        for lock in lock_dir.glob("*.sr.lock"):
            print(f"  removing {lock}")
            lock.unlink()
    for folder in (p.layers, p.data):
        folder.mkdir(parents=True, exist_ok=True)
        print(f"  mkdir {folder}")


def step_dem(p: config.PipelinePaths, overwrite: bool) -> None:
    """Re-emit the DEM GeoTIFF as a clean COG for the mission demFilePath."""
    banner("dem — DEM GeoTIFF → clean COG (demFilePath)")
    require_input(p.dem_in, "DEM GeoTIFF", "--dem")
    p.data.mkdir(parents=True, exist_ok=True)
    run([PYTHON, GEOTIFF_TO_COG, p.dem_in, "--compress", "zstd", "-o", p.dem_out])


def step_nac(p: config.PipelinePaths, overwrite: bool) -> None:
    """NAC mosaic → (stretch if float) → tile to one cap-grid layer."""
    banner("nac — NAC mosaic → cap-grid tile layer")
    require_input(p.nac_mosaic, "NAC mosaic raster", "--nac-mosaic")
    if not clear_layer_dir(p.nac_layer, overwrite):
        return

    if is_uint8(p.nac_mosaic):
        print("  mosaic is already 8-bit — tiling directly (no stretch)")
        run([PYTHON, TILE_TO_CAP_GRID, p.nac_mosaic, p.nac_layer])
        write_properties(p.nac_layer, "nac", config.OUT_NAC_LAYER_NAME)
        return

    scratch = p.out / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    stretched = scratch / "nac_mosaic_8bit.tif"
    try:
        run(
            [
                PYTHON,
                STRETCH_TO_8BIT,
                p.nac_mosaic,
                stretched,
                "--pct-low", "2",
                "--pct-high", "98",
                "--nodata", "-3.4e38",
            ]
        )
        run([PYTHON, TILE_TO_CAP_GRID, stretched, p.nac_layer])
        write_properties(p.nac_layer, "nac", config.OUT_NAC_LAYER_NAME)
    finally:
        stretched.unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass


def step_slope(p: config.PipelinePaths, overwrite: bool) -> None:
    """Slope float raster → colorize (lyrx ramp) → tile to one cap-grid layer."""
    banner("slope — slope float → colorize → cap-grid tile layer")
    require_input(p.slope_in, "slope raster", "--slope")
    if not clear_layer_dir(p.slope_layer, overwrite):
        return

    colorize_cmd: list[str | Path] = [PYTHON, COLORIZE_SLOPE, p.slope_in, p.slope_rgba]
    if p.lyrx.exists():
        colorize_cmd += ["--lyrx", p.lyrx]
    else:
        print(f"  (no --lyrx at {p.lyrx}; colorize_slope will auto-detect next to input)")
    try:
        run(colorize_cmd)
        run([PYTHON, TILE_TO_CAP_GRID, p.slope_rgba, p.slope_layer])
        # Legend from slope.txt — the same standard the .lyrx encodes, so the legend
        # matches the colorized tiles regardless of which slope source was used.
        write_properties(
            p.slope_layer, "slope", config.OUT_SLOPE_LAYER_NAME,
            ramp=config.COLOR_RAMPS_DIR / "slope.txt", units=config.PRODUCT_UNITS["slope"],
        )
    finally:
        p.slope_rgba.unlink(missing_ok=True)


def step_products(p: config.PipelinePaths, overwrite: bool) -> None:
    """Derive standardized products from the DEM → colorize → tile (one layer each).

    Default products are hillshade/aspect/tri (config.PRODUCTS_DEFAULT); slope is left to the
    dedicated `slope` step, which uses the identical colour standard.
    """
    banner("products — DEM → slope/hillshade/aspect/tri → cap-grid tile layers")
    require_input(p.dem_in, "DEM GeoTIFF", "--dem")

    layer_name = {
        "hillshade": config.OUT_HILLSHADE_LAYER_NAME,
        "aspect": config.OUT_ASPECT_LAYER_NAME,
        "tri": config.OUT_TRI_LAYER_NAME,
        "slope": config.OUT_SLOPE_LAYER_NAME,
    }

    scratch = p.out / "scratch_products"
    scratch.mkdir(parents=True, exist_ok=True)
    try:
        run([PYTHON, DEM_PRODUCTS, "--dem", p.dem_in, "--out", scratch,
             "--products", *config.PRODUCTS_DEFAULT])
        for product in config.PRODUCTS_DEFAULT:
            layer_dir = p.layers / layer_name[product]
            if not clear_layer_dir(layer_dir, overwrite):
                continue
            run([PYTHON, TILE_TO_CAP_GRID, scratch / f"{product}.tif", layer_dir])
            ramp = None if product == "hillshade" else config.COLOR_RAMPS_DIR / f"{product}.txt"
            units = config.PRODUCT_UNITS.get(product)
            write_properties(layer_dir, product, layer_name[product], ramp=ramp, units=units)
    finally:
        for product in config.PRODUCTS_DEFAULT:
            (scratch / f"{product}.tif").unlink(missing_ok=True)
        try:
            scratch.rmdir()
        except OSError:
            pass


def step_vector(p: config.PipelinePaths, overwrite: bool) -> None:
    """Landing-ellipse shapefile → GeoJSON (EPSG:4326)."""
    banner("vector — ellipse shapefile → GeoJSON")
    require_input(p.ellipse_shp, "ellipse shapefile", "--ellipse")
    p.data.mkdir(parents=True, exist_ok=True)
    run([PYTHON, SHP_TO_GEOJSON, p.ellipse_shp, p.ellipse_out, "--to-epsg", "4326"])


# ---------------------------------------------------------------------------
# Step registry
# ---------------------------------------------------------------------------

STEPS: list[tuple[str, str]] = [
    ("stage", "Remove .sr.lock files; create Layers/ and Data/"),
    ("dem", "DEM GeoTIFF → clean COG (demFilePath)"),
    ("nac", "NAC mosaic → stretch (if float) → tile to one cap-grid layer"),
    ("slope", "Slope float → colorize → tile to one cap-grid layer"),
    ("products", "DEM → hillshade/aspect/tri → colorize → tile (one layer each)"),
    ("vector", "Landing-ellipse shapefile → GeoJSON"),
]

STEP_FNS = {
    "stage": step_stage,
    "dem": step_dem,
    "nac": step_nac,
    "slope": step_slope,
    "products": step_products,
    "vector": step_vector,
}

STEP_NAMES = [name for name, _ in STEPS]
DEFAULT_STEPS = STEP_NAMES[:]  # all steps


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
    # De-dupe, keep canonical pipeline order.
    return [n for n in STEP_NAMES if n in set(chosen)]


# ---------------------------------------------------------------------------
# AEGIS admin summary
# ---------------------------------------------------------------------------

_TBD = "(run a tiling step first)"


def _trim(raw: str | None, fallback: str = _TBD) -> str:
    if raw is None:
        return fallback
    try:
        return str(float(raw))
    except (TypeError, ValueError):
        return raw


def _first_built_tmr(p: config.PipelinePaths) -> Path | None:
    product_layers = [p.layers / n for n in (
        config.OUT_HILLSHADE_LAYER_NAME,
        config.OUT_ASPECT_LAYER_NAME,
        config.OUT_TRI_LAYER_NAME,
    )]
    for layer in (p.nac_layer, p.slope_layer, *product_layers):
        tmr = layer / "tilemapresource.xml"
        if tmr.exists():
            return tmr
    return None


def _parse_origin_and_res(tmr: Path | None) -> tuple[str, str, str]:
    """Return (origin_x, origin_y, z0_units_per_pixel) from a tilemapresource.xml."""
    if tmr is None:
        return (_TBD, _TBD, _TBD)
    try:
        root = ET.parse(tmr).getroot()
        origin = root.find("Origin")
        ox = _trim(origin.get("x")) if origin is not None else _TBD
        oy = _trim(origin.get("y")) if origin is not None else _TBD
        res = _TBD
        for ts in root.iter("TileSet"):
            if ts.get("order") == "0":
                res = _trim(ts.get("units-per-pixel"))
                break
        return (ox, oy, res)
    except ET.ParseError:
        return ("(parse error)", "(parse error)", "(parse error)")


def print_aegis_summary(p: config.PipelinePaths) -> None:
    """Print a compact AEGIS admin-input summary for the mission."""
    banner("AEGIS Admin Input Summary")
    W = 32

    def row(label: str, value: str) -> None:
        print(f"  {label:<{W}} {value}")

    origin_x, origin_y, z0_res = _parse_origin_and_res(_first_built_tmr(p))

    print("\n  ┌─ Mission (top-level fields) ──────────────────────────────────┐")
    row("landerLocation (lat)", str(config.DEFAULT_LANDER_LAT))
    row("landerLocation (lng)", str(config.DEFAULT_LANDER_LNG))
    row("planetRadius", str(config.PLANET_RADIUS))
    row("projIsCustom", "true")
    row("projEpsg", config.PROJ_EPSG)
    row("projProj4String", config.PROJ_PROJ4)
    row("projBoundsMinX / MinY", str(config.CAP_MIN))
    row("projBoundsMaxX / MaxY", str(config.CAP_MAX))
    row("projOriginX", origin_x if origin_x != _TBD else str(config.CAP_MIN))
    row("projOriginY", origin_y if origin_y != _TBD else str(config.CAP_MIN))
    row("projResZoomLevel", "0")
    row("projResUnitsPerPixel", z0_res if z0_res != _TBD else str(config.CAP_Z0_RES))
    print("  └───────────────────────────────────────────────────────────────┘")

    def mark(path: Path) -> str:
        return "✓" if path.exists() else "✗ (not built)"

    print("\n  ┌─ Products ────────────────────────────────────────────────────┐")
    row("DEM (demFilePath)", f"Data/{config.OUT_DEM_NAME}  {mark(p.dem_out)}")
    row("demResolution", "1.0")
    row("NAC tile layer", f"Layers/{config.OUT_NAC_LAYER_NAME}/  {mark(p.nac_layer)}")
    row("Slope tile layer", f"Layers/{config.OUT_SLOPE_LAYER_NAME}/  {mark(p.slope_layer)}")
    for name in (config.OUT_HILLSHADE_LAYER_NAME, config.OUT_ASPECT_LAYER_NAME, config.OUT_TRI_LAYER_NAME):
        row(f"{name.capitalize()} tile layer", f"Layers/{name}/  {mark(p.layers / name)}")
    row("Landing ellipse (vector)", f"Data/{config.OUT_ELLIPSE_NAME}  {mark(p.ellipse_out)}")
    print("  └───────────────────────────────────────────────────────────────┘")
    print(
        '\n  Tile layers (type "tile"): urlTemplate Layers/<name>/{z}/{x}/{y}.png, '
        'tileFormat "tms".  Each writes a properties.json (name/description/legend) the '
        "admin auto-imports."
    )
    print(
        '  Vector (type "vector"): dataProjection EPSG:4326, '
        f"featureProjection {config.PROJ_EPSG}."
    )
    print(f"\n  Output root: {p.out}\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    step_lines = "\n".join(
        f"  {i:2d}  {name:<8}  {desc}" for i, (name, desc) in enumerate(STEPS)
    )
    parser = argparse.ArgumentParser(
        prog="python esri-to-aegis-lunar-southpole/main.py",
        description=textwrap.dedent("""\
            ESRI/ArcGIS → AEGIS lunar south-pole data-processing pipeline.

            Run from data_conversion_scripts/ via pixi:
              cd data_conversion_scripts
              pixi run python esri-to-aegis-lunar-southpole/main.py --out <output-root>
            """),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Available steps (use names or indices with --steps):\n{step_lines}",
    )
    parser.add_argument(
        "--out",
        type=Path,
        help="Output root (required to run steps). Creates Layers/ and Data/ inside.",
    )
    parser.add_argument(
        "--src",
        type=Path,
        default=None,
        help=f"Input data-drop root (default: {config.DEFAULT_SRC}).",
    )
    parser.add_argument("--dem", type=Path, default=None, help="Override DEM GeoTIFF path.")
    parser.add_argument("--slope", type=Path, default=None, help="Override slope raster path.")
    parser.add_argument("--lyrx", type=Path, default=None, help="Override slope .lyrx colour standard.")
    parser.add_argument("--ellipse", type=Path, default=None, help="Override ellipse shapefile path.")
    parser.add_argument(
        "--nac-mosaic",
        type=Path,
        default=None,
        help="Single GIS-provided NAC mosaic raster to tile (required for the nac step).",
    )
    parser.add_argument(
        "--steps",
        metavar="STEP",
        nargs="+",
        help=f"Steps to run, by name or index (default: all = {DEFAULT_STEPS}).",
    )
    parser.add_argument(
        "--from",
        dest="from_step",
        metavar="STEP",
        help="Run all default steps starting from this step (name or index).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Rebuild tile layers even if they already exist.",
    )
    parser.add_argument("--list", action="store_true", help="Print available steps and exit.")
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print the AEGIS admin input summary and exit (no steps run).",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.list:
        print("Available steps:")
        for i, (name, desc) in enumerate(STEPS):
            print(f"  {i:2d}  {name:<8}  {desc}")
        sys.exit(0)

    if args.out is None:
        parser.error("--out is required (replaces the old mission-number path).")

    p = config.resolve_paths(
        out=args.out,
        src=args.src,
        dem=args.dem,
        slope=args.slope,
        lyrx=args.lyrx,
        ellipse=args.ellipse,
        nac_mosaic=args.nac_mosaic,
    )

    if args.summary:
        print_aegis_summary(p)
        sys.exit(0)

    if args.steps:
        chosen = resolve_step_tokens(args.steps)
    elif args.from_step is not None:
        start = resolve_step_tokens([args.from_step])[0]
        start_idx = STEP_NAMES.index(start)
        chosen = [n for n in DEFAULT_STEPS if STEP_NAMES.index(n) >= start_idx]
    else:
        chosen = DEFAULT_STEPS

    print(f"Running steps: {chosen}")
    print(f"  src: {p.src}")
    print(f"  out: {p.out}")
    for name in chosen:
        STEP_FNS[name](p, args.overwrite)

    banner("Pipeline complete")
    print_aegis_summary(p)


if __name__ == "__main__":
    main()
