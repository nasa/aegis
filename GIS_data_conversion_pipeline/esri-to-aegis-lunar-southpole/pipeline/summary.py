"""The AEGIS admin-input summary printed at the end of a run (and via ``--summary``)."""

from __future__ import annotations

import argparse
import xml.etree.ElementTree as ET
from pathlib import Path

import config
from pipeline.reporting import banner, tee

_TBD = "(run a tiling step first)"


def _trim(raw: str | None, fallback: str = _TBD) -> str:
    if raw is None:
        return fallback
    try:
        return str(float(raw))
    except (TypeError, ValueError):
        return raw


def _raster_layer_names(args: argparse.Namespace) -> list[str]:
    names = getattr(args, "raster_name", [])
    return [
        names[index] if index < len(names) else Path(raster).stem
        for index, raster in enumerate(getattr(args, "in_raster", []))
    ]


def _viewshed_layer_names(args: argparse.Namespace) -> list[str]:
    names = getattr(args, "out_viewshed_raster", [])
    return [
        names[index] if index < len(names) else Path(raster).stem.removesuffix("_cog")
        for index, raster in enumerate(getattr(args, "in_viewshed_raster", []))
    ]


def _keepout_layer_names(args: argparse.Namespace) -> list[str]:
    names = getattr(args, "out_keepout_raster", [])
    return [
        names[index] if index < len(names) else Path(raster).stem.removesuffix("_cog")
        for index, raster in enumerate(getattr(args, "in_keepout_raster", []))
    ]


def _first_built_tmr(p: config.PipelinePaths, args: argparse.Namespace) -> Path | None:
    product_layers = [
        p.layer_path(n)
        for n in (
            config.OUT_HILLSHADE_LAYER_NAME,
            config.OUT_ASPECT_LAYER_NAME,
            config.OUT_TRI_LAYER_NAME,
        )
    ]
    raster_layers = [p.layer_path(name) for name in _raster_layer_names(args)]
    for layer in (
        *raster_layers,
        p.slope_layer,
        p.slope_colorblind_layer,
        *product_layers,
    ):
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


def print_aegis_summary(p: config.PipelinePaths, args: argparse.Namespace) -> None:
    """Print a compact AEGIS admin-input summary for the mission."""
    banner("AEGIS Admin Input Summary")
    W = 32

    def row(label: str, value: str) -> None:
        tee(f"  {label:<{W}} {value}")

    origin_x, origin_y, z0_res = _parse_origin_and_res(_first_built_tmr(p, args))
    lander_lat = (
        args.lander_lat if args.lander_lat is not None else config.DEFAULT_LANDER_LAT
    )
    lander_lng = (
        args.lander_lng if args.lander_lng is not None else config.DEFAULT_LANDER_LNG
    )

    tee("\n  ┌─ Mission (top-level fields) ──────────────────────────────────┐")
    row("name", args.mission_name or "(unset)")
    row("missionId", str(args.mission_id) if args.mission_id is not None else "(unset)")
    row("landerLocation (lat)", str(lander_lat))
    row("landerLocation (lng)", str(lander_lng))
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
    row("actionSystemVersion", "2")
    row("usingLGRSCoordinates", "true")
    tee("  └───────────────────────────────────────────────────────────────┘")

    def mark(path: Path) -> str:
        return "✓" if path.exists() else "✗ (not built)"

    tee("\n  ┌─ Products ────────────────────────────────────────────────────┐")
    row("DEM (demFilePath)", f"Data/{p.dem_out.name}  {mark(p.dem_out)}")
    row("demResolution", str(args.dem_resolution))
    if p.layer_prefix:
        row("layer prefix", f"{p.layer_prefix}_  (folders + AEGIS layer names)")
    for name in _raster_layer_names(args):
        row(
            "Raster tile layer",
            f"Layers/{p.layer_name(name)}/  {mark(p.layer_path(name))}",
        )
    for name in _viewshed_layer_names(args):
        layer_name = p.layer_name(name)
        out_cog = p.layers / layer_name / config.cog_layer_filename(layer_name)
        row(
            "Viewshed COG layer",
            f"Layers/{layer_name}/{out_cog.name}  {mark(out_cog)}",
        )
    for name in _keepout_layer_names(args):
        layer_name = p.layer_name(name)
        out_cog = p.layers / layer_name / config.cog_layer_filename(layer_name)
        row(
            "Keep-out COG layer",
            f"Layers/{layer_name}/{out_cog.name}  {mark(out_cog)}",
        )
    row(
        "Slope tile layer",
        f"Layers/{p.layer_name(config.OUT_SLOPE_LAYER_NAME)}/  {mark(p.slope_layer)}",
    )
    row(
        "Colorblind slope tile layer",
        f"Layers/{p.layer_name(config.OUT_SLOPE_COLORBLIND_LAYER_NAME)}/  "
        f"{mark(p.slope_colorblind_layer)}",
    )
    for name in (
        config.OUT_HILLSHADE_LAYER_NAME,
        config.OUT_ASPECT_LAYER_NAME,
        config.OUT_TRI_LAYER_NAME,
    ):
        row(
            f"{name.capitalize()} tile layer",
            f"Layers/{p.layer_name(name)}/  {mark(p.layer_path(name))}",
        )
    row(
        "Landing ellipse (vector)",
        f"Data/{config.OUT_ELLIPSE_NAME}  {mark(p.ellipse_out)}",
    )
    row(
        "Mission grid (LGRS)",
        f"{config.OUT_GRID_SOURCE_PATH}  {mark(p.out / config.OUT_GRID_SOURCE_PATH)}",
    )
    tee("  └───────────────────────────────────────────────────────────────┘")
    tee(f"\n  Output root: {p.out}\n")
