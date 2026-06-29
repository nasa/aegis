"""Central configuration for the ESRI/ArcGIS → AEGIS lunar south-pole pipeline.

Everything mission-, site-, or environment-specific lives here so the per-type
processing scripts (``dem/``, ``nac/``, ``slope/``, ``vector/``) and the shared
tiler (``common/tile_to_cap_grid.py``) stay generic.

Two things live in this file:

1. **The projection profile** — the shared lunar south-pole *cap grid* every
   raster layer is tiled onto. These constants are imported by
   ``common/tile_to_cap_grid.py`` (so the tiler and the AEGIS admin summary can
   never drift apart) and printed by ``main.py --summary``. This pipeline targets
   the lunar south pole only; there is intentionally no Earth/Web-Mercator profile.

2. **Path resolution** — :func:`resolve_paths` turns an input root (``--src``) and
   an output root (``--out``) into the concrete input/output file paths. There are
   **no mission numbers** anywhere; the output root *is* the per-environment knob.

The default input layout matches the A03MP026 (Mons Mouton Plateau) data drop, but
every input can be overridden on the command line, so a different drop only needs
different ``--src`` / per-input flags.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

# ---------------------------------------------------------------------------
# Projection profile — AEGIS lunar south-pole cap grid
# ---------------------------------------------------------------------------
# The shared map definition used by the production NAC_POLE_SOUTH_CM_AVG_MERGE
# basemap. Every layer tiled on this grid overlays that basemap pixel-for-pixel
# in Leaflet. CAP_Z0_RES MUST equal the mission's projResUnitsPerPixel (with
# projResZoomLevel = 0): Leaflet builds its resolution pyramid as
# CAP_Z0_RES / 2**z, so every layer must be cut on this same z0.

CAP_MIN = -931100.0  # cap bottom-left (both axes), == projOriginX/Y
CAP_MAX = 931100.0  # cap top-right (both axes)
TILE = 256  # tile size in pixels
CAP_Z0_RES = 12800.0  # z0 units-per-pixel == mission projResUnitsPerPixel
CAP_MAX_ZOOM = 13  # z13 = 1.5625 m/px (14 levels, TMS y-from-bottom)

PLANET_RADIUS = 1737400  # lunar sphere radius (m)
PROJ_EPSG = "IAU2000:30166"
PROJ_PROJ4 = (
    "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 "
    "+a=1737400 +b=1737400 +units=m +no_defs"
)

# Full WKT SRS written into each layer's tilemapresource.xml.
CAP_SRS = (
    'PROJCS["PolarStereographic_Moon",GEOGCS["GCS_Moon",DATUM["D_Moon",'
    'SPHEROID["Moon",1737400,0]],PRIMEM["Reference_Meridian",0],'
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]]],'
    'PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",-90],'
    'PARAMETER["central_meridian",0],PARAMETER["false_easting",0],'
    'PARAMETER["false_northing",0],UNIT["metre",1],'
    'AXIS["Easting",NORTH],AXIS["Northing",NORTH]]'
)

# ---------------------------------------------------------------------------
# Site defaults (A03MP026 — Mons Mouton Plateau). Overridable on the CLI.
# ---------------------------------------------------------------------------
# Used only by the printed AEGIS admin summary; not by the processing math.
DEFAULT_LANDER_LAT = -84.223397
DEFAULT_LANDER_LNG = 33.5021945

# Default input root (the unpacked GIS data drop). Override with --src.
DEFAULT_SRC = Path("F:/_repos/aegis_static/MS3")

# Input file paths relative to --src (A03MP026 layout). Override per-input on the CLI.
REL_DEM = Path("A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif")
REL_SLOPE = Path("A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif")
REL_LYRX = Path("A03MP026/Slope/AMPES_Slope 1.lyrx")  # slope colour standard
REL_ELLIPSE = Path("A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp")
# Single NAC mosaic delivered by the GIS team. No fixed name yet — pass --nac-mosaic.
REL_NAC_MOSAIC = Path("A03MP026_NAC_mosaic/nac_mosaic.tif")
# Per-frame NAC ortho directory — used ONLY by the preserved example under nac/examples/.
REL_NAC_FRAMES = Path("A03MP026_SFS_1mpp_orthoimages")

# Output file/dir names under --out (generic; the pipeline is mission-agnostic).
OUT_LAYERS_DIRNAME = "Layers"
OUT_DATA_DIRNAME = "Data"
OUT_DEM_NAME = "dem.tif"
OUT_ELLIPSE_NAME = "ellipse.geojson"
OUT_NAC_LAYER_NAME = "nac"
OUT_SLOPE_LAYER_NAME = "slope"
OUT_SLOPE_RGBA_NAME = "slope_rgba.tif"  # scratch, removed after tiling

# DEM-derived product layers (Layers/<name>/). Slope is intentionally omitted from the
# default products step because the dedicated `slope` step already produces a slope layer
# using the GIS-team .lyrx — which encodes the SAME standard as products/color_ramps/slope.txt.
# (The standalone products/dem_products.py can still generate slope on demand.)
OUT_HILLSHADE_LAYER_NAME = "hillshade"
OUT_ASPECT_LAYER_NAME = "aspect"
OUT_TRI_LAYER_NAME = "tri"
PRODUCTS_DEFAULT = ["hillshade", "aspect", "tri"]

# Colour-ramp directory (single source of truth for AEGIS colour treatment).
COLOR_RAMPS_DIR = Path(__file__).resolve().parent / "products" / "color_ramps"
# Legend units per colorized product (passed to properties/write_properties.py).
PRODUCT_UNITS = {"slope": "deg", "aspect": "", "tri": "m"}


@dataclass(frozen=True)
class PipelinePaths:
    """Resolved input/output paths for one pipeline run."""

    src: Path
    out: Path
    # Inputs
    dem_in: Path
    slope_in: Path
    lyrx: Path
    ellipse_shp: Path
    nac_mosaic: Path
    nac_frames_dir: Path
    # Output roots
    layers: Path
    data: Path
    # Output products
    dem_out: Path
    ellipse_out: Path
    nac_layer: Path
    slope_layer: Path
    slope_rgba: Path


def resolve_paths(
    out: Path,
    src: Path | None = None,
    *,
    dem: Path | None = None,
    slope: Path | None = None,
    lyrx: Path | None = None,
    ellipse: Path | None = None,
    nac_mosaic: Path | None = None,
    nac_frames: Path | None = None,
) -> PipelinePaths:
    """Build the concrete path set from an output root and an input root.

    ``out`` is required (replaces the old hardcoded ``missionFiles/<id>``). ``src``
    defaults to :data:`DEFAULT_SRC`. Any individual input may be overridden; an
    override that is absolute is used as-is, otherwise it is resolved under ``src``.
    """
    src = (src or DEFAULT_SRC).resolve()
    out = out.resolve()

    def under_src(override: Path | None, default_rel: Path) -> Path:
        if override is None:
            return src / default_rel
        return override if override.is_absolute() else src / override

    layers = out / OUT_LAYERS_DIRNAME
    data = out / OUT_DATA_DIRNAME

    return PipelinePaths(
        src=src,
        out=out,
        dem_in=under_src(dem, REL_DEM),
        slope_in=under_src(slope, REL_SLOPE),
        lyrx=under_src(lyrx, REL_LYRX),
        ellipse_shp=under_src(ellipse, REL_ELLIPSE),
        nac_mosaic=under_src(nac_mosaic, REL_NAC_MOSAIC),
        nac_frames_dir=under_src(nac_frames, REL_NAC_FRAMES),
        layers=layers,
        data=data,
        dem_out=data / OUT_DEM_NAME,
        ellipse_out=data / OUT_ELLIPSE_NAME,
        nac_layer=layers / OUT_NAC_LAYER_NAME,
        slope_layer=layers / OUT_SLOPE_LAYER_NAME,
        slope_rgba=out / OUT_SLOPE_RGBA_NAME,
    )
