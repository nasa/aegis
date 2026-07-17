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

Data steps (each runs only when its input is present): dem · nac · slope · products · vector ·
rasters · vectors · grid. Publish steps (opt-in): register · box. Every run writes a
``Data/conversion_report.md`` capturing the full console log + per-step timings.

Run from the parent ``GIS_data_conversion_pipeline/`` directory via pixi:

    cd GIS_data_conversion_pipeline
    pixi run python esri-to-aegis-lunar-southpole/main.py \\
        --aegis-url http://localhost:4000 \\
        --mission-id 123 --mission-name "A03MP026 - ART3 Surface EVA MS 3" \\
        --lander-lat -84.223397 --lander-lng 33.5021945 \\
        --dem F:/drop/dem.tif --products hillshade slope aspect tri \\
        --nac-mosaic F:/drop/nac.tif --register --box
    pixi run python esri-to-aegis-lunar-southpole/main.py --list

Register-only onto another server (e.g. prod) AFTER local generation + Box upload — see the
README "Registering on another server" section. --mission-id is the prod id; --out is the
locally-built folder (sublayer paths are folder names, identical across servers):

    pixi run python esri-to-aegis-lunar-southpole/main.py \\
        --aegis-url https://aegis.fit.nasa.gov --mission-id <PROD_ID> \\
        --mission-name "A03MP026 - ART3 Surface EVA MS 3" \\
        --lander-lat -84.223397 --lander-lng 33.5021945 \\
        --out F:/_repos/aegis_static/missionFiles/<LOCAL_ID> \\
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

    # Mission / server
    parser.add_argument(
        "--aegis-url",
        default="http://localhost:4000",
        help="AEGIS base URL (default: http://localhost:4000).",
    )
    parser.add_argument(
        "--mission-id",
        type=int,
        default=None,
        help="Existing AEGIS mission id (drives the output folder + registration).",
    )
    parser.add_argument(
        "--mission-name",
        default=None,
        help='Mission name, e.g. "A03MP026 - ART3 Surface EVA MS 3".',
    )
    parser.add_argument(
        "--lander-lat", type=float, default=None, help="Lander latitude."
    )
    parser.add_argument(
        "--lander-lng", type=float, default=None, help="Lander longitude."
    )
    parser.add_argument(
        "--dem-resolution",
        type=float,
        default=config.DEFAULT_DEM_RESOLUTION,
        help="DEM resolution m/px (mission demResolution).",
    )
    parser.add_argument(
        "--token", default=None, help="EMSS token (default: EMSS_TOKEN from .env)."
    )

    # Output location
    parser.add_argument(
        "--static-dir",
        type=Path,
        default=None,
        help="AEGIS static root (default: STATIC_DIR in .env or ../aegis_static).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Override output root (default: <static>/missionFiles/<mission-id>).",
    )
    parser.add_argument(
        "--src",
        type=Path,
        default=None,
        help=f"Input data-drop root (default: {config.DEFAULT_SRC}).",
    )

    # Inputs
    parser.add_argument("--dem", type=Path, default=None, help="DEM GeoTIFF path.")
    parser.add_argument("--slope", type=Path, default=None, help="Slope raster path.")
    parser.add_argument(
        "--lyrx", type=Path, default=None, help="Slope .lyrx colour standard."
    )
    parser.add_argument(
        "--ellipse", type=Path, default=None, help="Landing-ellipse shapefile path."
    )
    parser.add_argument(
        "--nac-mosaic",
        type=Path,
        default=None,
        help="GIS-provided NAC mosaic raster to tile.",
    )
    parser.add_argument(
        "--products",
        nargs="+",
        default=None,
        choices=["hillshade", "slope", "aspect", "tri"],
        metavar="PRODUCT",
        help="DEM-derived products to build (default: hillshade aspect tri; add slope to derive it from the DEM).",
    )
    parser.add_argument(
        "--raster",
        action="append",
        default=[],
        metavar="PATH",
        help="Custom raster layer (repeatable).",
    )
    parser.add_argument(
        "--vector",
        action="append",
        default=[],
        metavar="PATH",
        help="Custom vector layer, shp or geojson (repeatable).",
    )
    parser.add_argument(
        "--vector-tile-cache",
        action="append",
        default=[],
        metavar="PATH",
        help="ArcGIS vector-tile cache dir (has root.json) → Layers/<name>/<name>.pmtiles (repeatable).",
    )
    parser.add_argument(
        "--cog",
        action="append",
        default=[],
        metavar="PATH",
        help="Custom raster → Cloud-Optimised GeoTIFF sublayer in Layers/<stem>/<stem>.tif (repeatable).",
    )
    parser.add_argument(
        "--cog-nodata",
        type=float,
        default=None,
        help="noData value to tag on --cog outputs (e.g. -3.4e38).",
    )

    # Grid
    parser.add_argument(
        "--grid-extent",
        default=config.GRID_EXTENT_DEFAULT,
        help=f"LGRS grid square extent around the lander (default: {config.GRID_EXTENT_DEFAULT}).",
    )
    parser.add_argument(
        "--grid-precision",
        type=int,
        default=config.GRID_PRECISION_DEFAULT,
        help=f"LGRS grid cell size in metres (default: {config.GRID_PRECISION_DEFAULT}).",
    )

    # Publish toggles
    parser.add_argument(
        "--register",
        action="store_true",
        help="Register mission fields + layers/sublayers via the AEGIS API.",
    )
    parser.add_argument(
        "--box", action="store_true", help="Zip Data/ + each layer and upload to Box."
    )
    parser.add_argument(
        "--box-workers",
        type=int,
        default=4,
        help="Parallel Box zip/upload workers (default: 4).",
    )
    parser.add_argument(
        "--no-external-nac",
        action="store_true",
        help="Do not register the Common_LSP external NAC layer.",
    )
    parser.add_argument(
        "--no-mission-fields",
        action="store_true",
        help="Do not set mission GIS fields during register.",
    )
    parser.add_argument(
        "--no-grid",
        action="store_true",
        help="Do not build or register the LGRS mission grid.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="For register/box: print actions without calling the API/Box.",
    )

    # Step control
    parser.add_argument(
        "--steps",
        metavar="STEP",
        nargs="+",
        help="Steps to run, by name or index (default: inferred from inputs).",
    )
    parser.add_argument(
        "--from",
        dest="from_step",
        metavar="STEP",
        help="Run inferred steps starting from this step.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Rebuild tile layers even if they already exist.",
    )
    parser.add_argument(
        "--list", action="store_true", help="Print available steps and exit."
    )
    parser.add_argument(
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

    # Resolve the output root: explicit --out wins, else <static>/missionFiles/<id>.
    if args.out is not None:
        out = args.out
    elif args.mission_id is not None:
        out = config.mission_output_dir(args.mission_id, args.static_dir)
    else:
        parser.error(
            "--mission-id is required (or pass --out to override the output root)."
        )

    p = config.resolve_paths(
        out=out,
        src=args.src,
        dem=args.dem,
        slope=args.slope,
        lyrx=args.lyrx,
        ellipse=args.ellipse,
        nac_mosaic=args.nac_mosaic,
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

    # Publish-only run (e.g. registering a previously-built mission onto prod): the data steps
    # that would create <out> aren't running, so the built folder must already exist. When
    # pointing --aegis-url at prod from a workstation, pass --out at the LOCAL build (its
    # mission id differs from prod's) — sublayer paths are folder names, so the only
    # prod-specific value is --mission-id.
    publish_only = bool(chosen) and not (set(chosen) & steps.DATA_STEPS)
    if publish_only and not p.out.exists():
        parser.error(
            f"Output folder does not exist: {p.out}\n"
            "For a register/box-only run, pass --out pointing at the locally-built mission "
            "folder (e.g. <static>/missionFiles/<local-id>). --mission-id is the TARGET "
            "server's mission id; --out is where the built Layers/ and Data/ live locally."
        )

    # Capture all console output (this process + the in-process Box step) into the report.
    install_capture()

    banner(
        f"AEGIS pipeline — mission {args.mission_id} ({args.mission_name or 'unnamed'})"
    )
    tee(f"  aegis-url : {args.aegis_url}")
    tee(f"  src       : {p.src}")
    tee(f"  out       : {p.out}")
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
