#!/usr/bin/env python3
"""GIS data drop → AEGIS mission pipeline (lunar south-pole cap grid).

Turns a mission's GIS inputs into AEGIS-ready map products **and** registers them on a
running AEGIS server. Given a mission id (already created in the AEGIS admin), the pipeline
writes products into ``<static>/missionFiles/<id>/`` and then, over HTTP, sets the mission's
projection/DEM/lander/grid fields, creates the header layers, and registers every generated
layer as a sublayer — so no admin "import from file" clicking is needed.

This file stays a thin CLI: the step functions, helpers, output capture, and summary live in
the ``pipeline/`` package (``pipeline.steps`` / ``pipeline.reporting`` / ``pipeline.summary``);
the cap-grid projection profile + path resolution live in ``config.py``; the AEGIS API + Box
logic in ``register.py`` / ``box_publish.py``.

Data steps (each runs only when its input is present): dem · slope · products · vector ·
rasters · vectors. Opt-in data steps: contours (--contours) · grid (--grid). Publish steps
(opt-in): register · box. Every run writes a
``Data/conversion_report.md`` capturing the full console log + per-step timings.

Run from the parent ``GIS_data_conversion_pipeline/`` directory via pixi:

    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/main.py \\
        --aegis-url http://localhost:4000 \\
        --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \\
        --lander-lat -84.223397 --lander-lng 33.5021945 \\
        --in-dem F:/drop/dem.tif --dem-products hillshade slope aspect tri \\
        --in-raster F:/drop/nac.tif --raster-name NAC_mosaic --register --box
    pixi run python esri-to-aegis-lunar-southpole/main.py --list

Register-only onto another server (e.g. prod) AFTER local generation + Box upload — see the
README "Registering on another server" section. --mission-id is the prod id; --out-dir is the
locally-built folder (sublayer paths are folder names, identical across servers):

    pixi run python esri-to-aegis-lunar-southpole/main.py \\
        --aegis-url https://aegis.fit.nasa.gov --mission-id <PROD_ID> \\
        --mission-name "A03MP026 - ART3 Surface EVA MS 3" \\
        --lander-lat -84.223397 --lander-lng 33.5021945 \\
        --out-dir F:/_repos/aegis_static/missionFiles/<LOCAL_ID> \\
        --token <PROD_EMSS_TOKEN> --steps register
"""

from __future__ import annotations

import argparse
import sys
import textwrap
import time
from pathlib import Path

# Windows consoles default to cp1252, which can't encode the "→" in banners. Reconfigure the
# real streams BEFORE pipeline.reporting tees them.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):
        pass

import config
from pipeline import steps, summary
from pipeline.reporting import banner, install_capture, tee, write_conversion_report


def build_parser() -> argparse.ArgumentParser:
    step_lines = "\n".join(
        f"  {i:2d}  {name:<9}  {desc}" for i, (name, desc) in enumerate(steps.STEPS)
    )
    parser = argparse.ArgumentParser(
        prog="python esri-to-aegis-lunar-southpole/main.py",
        description=textwrap.dedent("""\
            GIS data drop → AEGIS mission pipeline (lunar south-pole cap grid).

            Run from GIS_data_conversion_pipeline/ via pixi:
              cd GIS_data_conversion_pipeline
              pixi run python esri-to-aegis-lunar-southpole/main.py --mission-id <id> ...
            """),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Available steps (use names or indices with --steps):\n{step_lines}",
    )

    mission = parser.add_argument_group("Mission / server")
    mission.add_argument(
        "--aegis-url",
        default="http://localhost:4000",
        help="AEGIS base URL (default: http://localhost:4000).",
    )
    mission.add_argument(
        "--mission-id",
        type=int,
        default=None,
        help="Existing AEGIS mission id (drives the output folder + registration).",
    )
    mission.add_argument(
        "--mission-name",
        default=None,
        help='Mission name, e.g. "A03MP026 - ART3 Surface EVA MS 3".',
    )
    mission.add_argument(
        "--lander-lat", type=float, default=None, help="Lander latitude."
    )
    mission.add_argument(
        "--lander-lng", type=float, default=None, help="Lander longitude."
    )
    mission.add_argument(
        "--dem-resolution",
        type=float,
        default=config.DEFAULT_DEM_RESOLUTION,
        help="DEM resolution m/px (mission demResolution).",
    )
    mission.add_argument(
        "--token", default=None, help="EMSS token (default: EMSS_TOKEN from .env)."
    )

    inputs = parser.add_argument_group("Inputs (--in-*)")
    inputs.add_argument(
        "--in-root",
        dest="in_root",
        type=Path,
        default=None,
        help=f"Input data-drop root (default: {config.DEFAULT_SRC}).",
    )
    inputs.add_argument(
        "--in-dem",
        dest="in_dem",
        type=Path,
        default=None,
        help="DEM GeoTIFF path.",
    )
    inputs.add_argument(
        "--in-slope",
        dest="in_slope",
        type=Path,
        default=None,
        help="Slope raster path.",
    )
    inputs.add_argument(
        "--in-lyrx",
        dest="in_lyrx",
        type=Path,
        default=None,
        help="Slope .lyrx colour standard.",
    )
    inputs.add_argument(
        "--in-ellipse",
        dest="in_ellipse",
        type=Path,
        default=None,
        help="Landing-ellipse shapefile path.",
    )
    inputs.add_argument(
        "--in-raster",
        dest="in_raster",
        action="append",
        default=[],
        metavar="PATH",
        help="Custom raster layer (repeatable).",
    )
    inputs.add_argument(
        "--raster-name",
        dest="raster_name",
        action="append",
        default=[],
        metavar="NAME",
        help="Output layer name for each --in-raster (repeat once per raster; defaults to the source stem).",
    )
    inputs.add_argument(
        "--in-vector",
        dest="in_vector",
        action="append",
        default=[],
        metavar="PATH",
        help="Custom vector layer, shp or geojson (repeatable).",
    )
    inputs.add_argument(
        "--in-esri-vector-tiles",
        dest="in_esri_vector_tiles",
        action="append",
        default=[],
        metavar="PATH",
        help="ArcGIS vector-tile cache dir (has root.json) → Layers/<name>/<name>.pmtiles (repeatable).",
    )
    inputs.add_argument(
        "--in-cog",
        dest="in_cog",
        action="append",
        default=[],
        metavar="PATH",
        help="Custom raster → Cloud-Optimised GeoTIFF sublayer in Layers/<stem>/<stem>_cog.tif (repeatable).",
    )
    inputs.add_argument(
        "--in-cog-nodata",
        dest="in_cog_nodata",
        type=float,
        default=None,
        help="noData value to tag on --in-cog outputs (e.g. -3.4e38).",
    )
    inputs.add_argument(
        "--in-viewshed-raster",
        dest="in_viewshed_raster",
        action="append",
        default=[],
        metavar="PATH",
        help=(
            "Classified viewshed GeoTIFF (1=visible, 2=non-visible, 255=nodata) "
            "to convert into a transparent-mask RGBA COG; repeatable."
        ),
    )
    inputs.add_argument(
        "--out-viewshed-raster",
        dest="out_viewshed_raster",
        action="append",
        default=[],
        metavar="NAME",
        help=(
            "Output layer name for each --in-viewshed-raster; repeat once per input "
            "or omit to use the source filename."
        ),
    )
    inputs.add_argument(
        "--in-keepout-raster",
        dest="in_keepout_raster",
        action="append",
        default=[],
        metavar="PATH",
        help=(
            "Classified slope keep-out GeoTIFF (0=keep-out, 255=nodata) "
            "to convert into a transparent-mask RGBA COG; repeatable."
        ),
    )
    inputs.add_argument(
        "--out-keepout-raster",
        dest="out_keepout_raster",
        action="append",
        default=[],
        metavar="NAME",
        help=(
            "Output layer name for each --in-keepout-raster; repeat once per input "
            "or omit to use the source filename."
        ),
    )

    output = parser.add_argument_group("Output location (--out-* / --layer-*)")
    output.add_argument(
        "--out-dir",
        dest="out_dir",
        type=Path,
        default=None,
        help="Override output root (default: <static>/missionFiles/<mission-id>).",
    )
    output.add_argument(
        "--out-static-dir",
        dest="out_static_dir",
        type=Path,
        default=None,
        help="AEGIS static root (default: STATIC_DIR in .env or ../aegis_static).",
    )
    output.add_argument(
        "--layer-prefix",
        dest="layer_prefix",
        default=None,
        metavar="PREFIX",
        help=(
            "Prefix for every generated layer folder AND its AEGIS layer name "
            '(e.g. --layer-prefix LOLA → Layers/LOLA_hillshade, "LOLA_hillshade"). '
            "Lets multiple DEM runs coexist in one mission without clobbering each "
            "other's layer folders. Does not affect Data/ outputs (DEM COG, grid, vectors)."
        ),
    )

    dem_products = parser.add_argument_group("DEM-derived products (--dem-*)")
    dem_products.add_argument(
        "--dem-products",
        dest="dem_products",
        nargs="+",
        default=None,
        choices=["hillshade", "slope", "aspect", "tri"],
        metavar="PRODUCT",
        help="DEM-derived products to build (default: hillshade aspect tri; add slope to derive it from the DEM).",
    )
    dem_products.add_argument(
        "--dem-products-as-cog",
        dest="dem_products_as_cog",
        action="store_true",
        help=(
            "Emit DEM-derived products (--dem-products) as Cloud-Optimised GeoTIFFs "
            "(Layers/<name>/<name>_cog.tif) instead of tile pyramids. "
            "OL renders them directly via HTTP Range — no tiling step needed."
        ),
    )
    dem_products.add_argument(
        "--dem-products-only",
        dest="dem_products_only",
        action="store_true",
        help=(
            "Use --in-dem only to derive products/contours; do NOT write it as the mission "
            "DEM. Skips the 'dem' step (no Data/ COG) and leaves demFilePath/demResolution "
            "untouched on register. Use when adding a supplementary DEM's layers to a mission "
            "that already has its primary DEM (typically with --layer-prefix)."
        ),
    )

    contours = parser.add_argument_group("Contours (--contours*)")
    contours.add_argument(
        "--contours",
        action="store_true",
        help="Generate major/minor contour PMTiles from the DEM (Layers/contours_<interval>m).",
    )
    contours.add_argument(
        "--contours-major",
        dest="contours_major",
        type=int,
        default=config.CONTOUR_MAJOR_INTERVAL_DEFAULT,
        help=f"Major contour interval in metres (default: {config.CONTOUR_MAJOR_INTERVAL_DEFAULT}).",
    )
    contours.add_argument(
        "--contours-minor",
        dest="contours_minor",
        type=int,
        default=config.CONTOUR_MINOR_INTERVAL_DEFAULT,
        help=f"Minor contour interval in metres (default: {config.CONTOUR_MINOR_INTERVAL_DEFAULT}).",
    )
    contours.add_argument(
        "--contours-maxzoom",
        dest="contours_maxzoom",
        type=int,
        default=None,
        help="Deepest cap-grid LOD for contours (default: derived from --dem-resolution).",
    )

    grid = parser.add_argument_group("Grid (--grid*)")
    grid.add_argument(
        "--grid",
        action="store_true",
        help="Generate the LGRS mission grid GeoJSON from the lander location (requires --lander-lat/--lander-lng).",
    )
    grid.add_argument(
        "--grid-extent",
        default=config.GRID_EXTENT_DEFAULT,
        help=f"LGRS grid square extent around the lander (default: {config.GRID_EXTENT_DEFAULT}). Only used when --grid is passed.",
    )
    grid.add_argument(
        "--grid-precision",
        type=int,
        default=config.GRID_PRECISION_DEFAULT,
        help=f"LGRS grid cell size in metres (default: {config.GRID_PRECISION_DEFAULT}). Only used when --grid is passed.",
    )

    publish = parser.add_argument_group("Publish")
    publish.add_argument(
        "--register",
        action="store_true",
        help="Register mission fields + layers/sublayers via the AEGIS API.",
    )
    publish.add_argument(
        "--register-no-mission-fields",
        dest="register_no_mission_fields",
        action="store_true",
        help="Do not set mission GIS fields during register.",
    )
    publish.add_argument(
        "--register-no-external-nac",
        dest="register_no_external_nac",
        action="store_true",
        help="Do not register the external NAC layer.",
    )
    publish.add_argument(
        "--register-no-grid",
        dest="register_no_grid",
        action="store_true",
        help="Do not register the LGRS mission grid during the register step (grid GeoJSON is still built if --grid is passed).",
    )
    publish.add_argument(
        "--box", action="store_true", help="Zip Data/ + each layer and upload to Box."
    )
    publish.add_argument(
        "--box-workers",
        type=int,
        default=4,
        help="Parallel Box zip/upload workers (default: 4).",
    )
    publish.add_argument(
        "--dry-run",
        action="store_true",
        help="For register/box: print actions without calling the API/Box.",
    )

    run_control = parser.add_argument_group("Run control")
    run_control.add_argument(
        "--steps",
        metavar="STEP",
        nargs="+",
        help="Steps to run, by name or index (default: inferred from inputs).",
    )
    run_control.add_argument(
        "--from",
        dest="from_step",
        metavar="STEP",
        help="Run inferred steps starting from this step.",
    )
    run_control.add_argument(
        "--overwrite",
        action="store_true",
        help="Rebuild tile layers even if they already exist.",
    )
    run_control.add_argument(
        "--list", action="store_true", help="Print available steps and exit."
    )
    run_control.add_argument(
        "--summary",
        action="store_true",
        help="Print the AEGIS admin input summary and exit.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.list:
        print("Available steps:")
        for i, (name, desc) in enumerate(steps.STEPS):
            print(f"  {i:2d}  {name:<9}  {desc}")
        sys.exit(0)

    # Resolve the output root: explicit --out-dir wins, else <static>/missionFiles/<id>.
    if args.out_dir is not None:
        out = args.out_dir
    elif args.mission_id is not None:
        out = config.mission_output_dir(args.mission_id, args.out_static_dir)
    else:
        parser.error(
            "--mission-id is required (or pass --out-dir to override the output root)."
        )

    p = config.resolve_paths(
        out=out,
        src=args.in_root,
        dem=args.in_dem,
        slope=args.in_slope,
        lyrx=args.in_lyrx,
        ellipse=args.in_ellipse,
        layer_prefix=args.layer_prefix,
    )

    if args.summary:
        summary.print_aegis_summary(p, args)
        sys.exit(0)

    if args.steps:
        chosen = steps.resolve_step_tokens(args.steps)
    elif args.from_step is not None:
        start = steps.resolve_step_tokens([args.from_step])[0]
        start_idx = steps.STEP_NAMES.index(start)
        chosen = [
            n
            for n in steps.default_steps(args, p)
            if steps.STEP_NAMES.index(n) >= start_idx
        ]
    else:
        chosen = steps.default_steps(args, p)

    # --no-mission-dem means the DEM is products-only: never run the 'dem' step (which would
    # write the mission DEM COG), even if it was explicitly requested via --steps.
    dropped_dem_step = args.dem_products_only and "dem" in chosen
    if dropped_dem_step:
        chosen = [n for n in chosen if n != "dem"]

    # Publish-only run (e.g. registering a previously-built mission onto prod): the data steps
    # that would create <out> aren't running, so the built folder must already exist. When
    # pointing --aegis-url at prod from a workstation, pass --out at the LOCAL build (its
    # mission id differs from prod's) — sublayer paths are folder names, so the only
    # prod-specific value is --mission-id.
    publish_only = bool(chosen) and not (set(chosen) & steps.DATA_STEPS)
    if publish_only and not p.out.exists():
        parser.error(
            f"Output folder does not exist: {p.out}\n"
            "For a register/box-only run, pass --out-dir pointing at the locally-built mission "
            "folder (e.g. <static>/missionFiles/<local-id>). --mission-id is the TARGET "
            "server's mission id; --out-dir is where the built Layers/ and Data/ live locally."
        )

    # Capture all console output (this process + the in-process Box step) into the report.
    install_capture()

    banner(
        f"AEGIS pipeline — mission {args.mission_id} ({args.mission_name or 'unnamed'})"
    )
    tee(f"  aegis-url : {args.aegis_url}")
    tee(f"  src       : {p.src}")
    tee(f"  out       : {p.out}")
    if args.dem_products_only:
        note = " (dropped 'dem' step)" if dropped_dem_step else ""
        tee(f"  dem mode  : products-only — mission DEM untouched{note}")
    tee(f"  plan      : {len(chosen)} step(s)")
    step_desc = dict(steps.STEPS)
    for i, name in enumerate(chosen):
        tee(f"    {i + 1}. {name:<9} — {step_desc[name]}")

    steps_timing: list[tuple[str, float, str]] = []
    overall_start = time.monotonic()
    try:
        for i, name in enumerate(chosen):
            tee(f"\n{'━' * 70}")
            tee(
                f"  ▶ STEP {i + 1}/{len(chosen)}: {name}   "
                f"[{time.strftime('%H:%M:%S')} · elapsed {time.monotonic() - overall_start:.0f}s]"
            )
            tee("━" * 70)
            t0 = time.monotonic()
            try:
                steps.STEP_FNS[name](p, args)
            except BaseException as e:  # record timing, then re-raise
                steps_timing.append(
                    (name, time.monotonic() - t0, f"FAILED ({type(e).__name__})")
                )
                raise
            secs = time.monotonic() - t0
            steps_timing.append((name, secs, "ok"))
            tee(f"  ✓ {name} complete in {secs:.1f}s")

        banner("Pipeline complete")
        summary.print_aegis_summary(p, args)
        tee(f"  total elapsed: {time.monotonic() - overall_start:.1f}s")
    finally:
        report = write_conversion_report(p.out, args, steps_timing)
        if report:
            tee(f"\n  conversion report written: {report}")


if __name__ == "__main__":
    main()
