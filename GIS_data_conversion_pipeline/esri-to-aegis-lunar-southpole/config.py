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

2. **Path resolution** — :func:`resolve_paths` turns an input root (``--in-root``) and
   an output root (``--out-dir``) into the concrete input/output file paths. There are
   **no mission numbers** anywhere; the output root *is* the per-environment knob.

The default input layout matches the A03MP026 (Mons Mouton Plateau) data drop, but
every input can be overridden on the command line, so a different drop only needs
different ``--in-root`` / per-input flags.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from aegis_api import DEFAULT_ENV_FILE, REPO_ROOT, load_env_value

# ---------------------------------------------------------------------------
# Projection profile — AEGIS lunar south-pole cap grid
# ---------------------------------------------------------------------------
# The shared map definition used by the production NAC_POLE_SOUTH_CM_AVG_MERGE
# basemap. Every layer tiled on this grid overlays that basemap pixel-for-pixel
# in OpenLayers. CAP_Z0_RES MUST equal the mission's projResUnitsPerPixel (with
# projResZoomLevel = 0): OpenLayers builds its resolution pyramid as
# CAP_Z0_RES / 2**z, so every layer must be cut on this same z0. Each layer's
# DEPTH (max zoom) is per-layer, derived from its native resolution by the tiler
# (an OpenLayers per-layer pyramid) — there is no shared zoom clamp.

CAP_MIN = -931100.0  # cap bottom-left (both axes), == projOriginX/Y
CAP_MAX = 931100.0  # cap top-right (both axes)
TILE = 256  # tile size in pixels
CAP_Z0_RES = 12800.0  # z0 units-per-pixel == mission projResUnitsPerPixel
# Zoom range of the external NAC basemap ONLY (its published S3 tiles are z0..z13). New
# layers cut by tile_to_cap_grid.py are NOT clamped to this — each cuts to its native depth.
CAP_EXTERNAL_NAC_MAX_ZOOM = 13

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

# Default input root (the unpacked GIS data drop). Override with --in-root.
DEFAULT_SRC = Path("F:/_repos/aegis_static/MS3")

# Input file paths relative to --in-root (A03MP026 layout). Override per-input on the CLI.
REL_DEM = Path("A03MP026/SFS_1mpp_DEM/mp2-sfs-dem_MoonSP_COG.tif")
REL_SLOPE = Path("A03MP026/Slope/SiteUD1_final_adj_5mpp_slp.tif")
REL_LYRX = Path("A03MP026/Slope/AMPES_Slope 1.lyrx")  # slope colour standard
REL_ELLIPSE = Path("A03MP026/Ellipse_shapefile/A03MP026_Ellipse.shp")
# Single NAC mosaic delivered by the GIS team. No fixed name yet — pass --in-nac.
REL_NAC_MOSAIC = Path("A03MP026_NAC_mosaic/nac_mosaic.tif")
# Per-frame NAC ortho directory — used ONLY by the preserved example under nac/examples/.
REL_NAC_FRAMES = Path("A03MP026_SFS_1mpp_orthoimages")

# Output file/dir names under --out (generic; the pipeline is mission-agnostic).
OUT_LAYERS_DIRNAME = "Layers"
OUT_DATA_DIRNAME = "Data"
# Compression for every COG the browser may read (OL-rendered sublayers via
# products-as-cog/--cog, AND the mission DEM, which we may hit directly from the browser).
# Must be a codec the browser GeoTIFF decoder (geotiff.js, used by ol/source/GeoTIFF) can
# decode: raw, LZW, JPEG, Deflate, PackBits, LERC. ZSTD (TIFF tag 50000) is NOT supported by
# geotiff.js and renders blank in the browser — GDAL/rasterio decode it server-side, but the
# browser cannot, so do not use it for anything that might be fetched client-side.
COG_COMPRESS = "deflate"
# The DEM keeps its source filename with a compression + _cog suffix (e.g.
# mp2-sfs-dem_MoonSP_COG.tif → mp2-sfs-dem_MoonSP_COG_deflate_cog.tif) so the mission's
# demFilePath is self-describing rather than an opaque "dem.tif".
DEM_COMPRESS = COG_COMPRESS
OUT_ELLIPSE_NAME = "ellipse.geojson"


def cog_layer_filename(name: str) -> str:
    """Filename for an OL-rendered COG sublayer inside its ``Layers/<name>/`` folder.

    Every COG we generate carries a ``_cog`` marker so a ``.tif`` in a build tree is
    recognisably a Cloud-Optimised GeoTIFF (the app still routes on the ``.tif`` extension).
    """
    return f"{name}_cog.tif"


def dem_output_name(dem_in: Path) -> str:
    """COG output filename for a DEM input: ``<source-stem>_<compress>_cog.tif``."""
    return f"{dem_in.stem}_{DEM_COMPRESS}_cog.tif"


OUT_NAC_LAYER_NAME = "nac"
OUT_SLOPE_LAYER_NAME = "slope"
OUT_SLOPE_RGBA_NAME = "slope_rgba.tif"  # scratch, removed after tiling

# DEM-derived product layers (Layers/<name>/). Slope is intentionally omitted from the
# default products step because the dedicated `slope` step already produces a slope layer
# using the GIS-team .lyrx — which encodes the SAME standard as default_color_ramps/slope.txt.
# (The standalone products/dem_products.py can still generate slope on demand.)
OUT_HILLSHADE_LAYER_NAME = "hillshade"
OUT_ASPECT_LAYER_NAME = "aspect"
OUT_TRI_LAYER_NAME = "tri"
PRODUCTS_DEFAULT = ["hillshade", "aspect", "tri"]

# Built-in (fallback) colour ramps. Used when the GIS team does not deliver product
# symbology as a .lyrx; a delivered .lyrx is converted (products/lyrx_to_ramp.py) and used
# instead. slope.txt encodes the same standard as the MS3 AMPES_Slope 1.lyrx.
DEFAULT_COLOR_RAMPS_DIR = (
    Path(__file__).resolve().parent / "products" / "default_color_ramps"
)
# Legend units per colorized product (passed to properties/write_properties.py).
PRODUCT_UNITS = {"slope": "deg", "aspect": "", "tri": "m"}

# TRI colour treatment is resolution-dependent (see the gotcha in GIS_data_conversion_pipeline/
# CLAUDE.md): a matching ramp from default_color_ramps/ARCHIVE/ must be used per DEM resolution,
# otherwise the legend bins (and colours) are wrong. Falls back to the legacy tri.txt.
TRI_RAMP_BY_RESOLUTION = {
    1.0: "TRIColors_1m_DEM.txt",
    5.0: "TRIColors_5m_DEM.txt",
    10.0: "TRIColors_10m_DEM.txt",
}


# ---------------------------------------------------------------------------
# Mission grid (LGRS) defaults
# ---------------------------------------------------------------------------
# Square grid extent centred on the lander and cell size (metres) for grid/generate_lgrs.py.
GRID_EXTENT_DEFAULT = "10km"
GRID_PRECISION_DEFAULT = 100
GRID_DEFAULT_NAME = "LGRS"
# The AEGIS mission-grid GeoJSON produced by the grid step (kept in the output ROOT, not in
# Data/, so it is not mis-registered as a vector layer; the register step POSTs it to the grid
# API, which writes the active grid's coordinate JSON into Data/ itself).
OUT_GRID_SOURCE_NAME = "grid_source.geojson"


def tri_ramp_for_resolution(resolution: float | None) -> Path:
    """Return the TRI colour ramp matching the DEM resolution (legacy tri.txt fallback)."""
    name = (
        TRI_RAMP_BY_RESOLUTION.get(float(resolution))
        if resolution is not None
        else None
    )
    if name:
        candidate = DEFAULT_COLOR_RAMPS_DIR / "ARCHIVE" / name
        if candidate.exists():
            return candidate
    return DEFAULT_COLOR_RAMPS_DIR / "tri.txt"


# Default DEM native resolution (m/px) written to the mission demResolution.
DEFAULT_DEM_RESOLUTION = 1.0

# ---------------------------------------------------------------------------
# Contours (DEM → vector-tile PMTiles)
# ---------------------------------------------------------------------------
# Two contour sublayers are generated from the DEM so majors/minors can be styled
# independently: a coarse "major" set and a fine "minor" set (which excludes the major
# lines so coincident intervals aren't double-drawn). Layer folders are named
# contours_<interval>m. Intervals are in metres.
CONTOUR_MAJOR_INTERVAL_DEFAULT = 100
CONTOUR_MINOR_INTERVAL_DEFAULT = 20


def contour_layer_name(interval: int) -> str:
    """Layer folder / archive base name for a contour interval (e.g. 100 → ``contours_100m``)."""
    return f"contours_{interval}m"


# ---------------------------------------------------------------------------
# AEGIS registration: header layers + the shared external NAC basemap
# ---------------------------------------------------------------------------
# Header (parent) layer name all pipeline-generated sublayers group under.
HEADER_ALL_LAYERS = "All Layers"

# The shared lunar south-pole NAC mosaic, hosted externally and reused by every LSP
# mission. Registered as an "external" tile sublayer: path = base URL, final tile URL
# = path + "/" + tilePattern. boundingBox/zoom mirror the published tilemapresource.xml
# (cap grid, z0..z13). See https://ares-aegis.s3.us-gov-west-1.amazonaws.com/NAC_POLE_SOUTH_CM_AVG_MERGE/
EXTERNAL_NAC = {
    "name": "NAC_POLE_SOUTH_CM_AVG_MERGE",
    "base_url": "https://ares-aegis.s3.us-gov-west-1.amazonaws.com/NAC_POLE_SOUTH_CM_AVG_MERGE",
    "tile_pattern": "{z}/{x}/{y}.png",
    "bounding_box": [CAP_MIN, CAP_MIN, CAP_MAX, CAP_MAX],
    "min_native_zoom": 0,
    "max_native_zoom": CAP_EXTERNAL_NAC_MAX_ZOOM,
    "tile_format": "tms",
    "description": (
        "Lunar Reconnaissance Orbiter Camera (LROC) Narrow Angle Camera (NAC) "
        "high-resolution panchromatic mosaic of the lunar south pole."
    ),
}


def resolve_static_dir(static_dir: Path | None = None) -> Path:
    """Resolve the AEGIS static root (holds ``missionFiles/<id>``).

    Precedence: explicit ``static_dir`` arg > ``STATIC_DIR`` in the repo ``.env`` >
    ``../aegis_static`` next to the repo. Relative values resolve against the repo root.
    """
    if static_dir is not None:
        return static_dir.resolve()
    env_val = load_env_value("STATIC_DIR", DEFAULT_ENV_FILE) or "../aegis_static"
    p = Path(env_val)
    return p.resolve() if p.is_absolute() else (REPO_ROOT / p).resolve()


def mission_output_dir(mission_id: int, static_dir: Path | None = None) -> Path:
    """The output root for a mission: ``<static>/missionFiles/<id>``."""
    return resolve_static_dir(static_dir) / "missionFiles" / str(mission_id)


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
    # Optional prefix applied to every generated layer FOLDER + its AEGIS layer name
    # (e.g. "LOLA" → Layers/LOLA_hillshade, name "LOLA_hillshade"). Empty = no prefix.
    layer_prefix: str = ""

    def layer_name(self, base: str) -> str:
        """Prefix a base layer name with ``<prefix>_`` when a layer_prefix is set."""
        return f"{self.layer_prefix}_{base}" if self.layer_prefix else base

    def layer_path(self, base: str) -> Path:
        """Layers/ subdirectory for a base layer name, honouring the layer_prefix."""
        return self.layers / self.layer_name(base)


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
    layer_prefix: str | None = None,
) -> PipelinePaths:
    """Build the concrete path set from an output root and an input root.

    ``out`` is required (replaces the old hardcoded ``missionFiles/<id>``). ``src``
    defaults to :data:`DEFAULT_SRC`. Any individual input may be overridden; an
    override that is absolute is used as-is, otherwise it is resolved under ``src``.

    ``layer_prefix`` (from ``--layer-prefix``) namespaces every generated layer
    folder and its AEGIS layer name (e.g. ``LOLA`` → ``Layers/LOLA_hillshade``), so
    multiple DEM runs can coexist in one mission.
    """
    src = (src or DEFAULT_SRC).resolve()
    out = out.resolve()
    prefix = (layer_prefix or "").strip().strip("_")

    def under_src(override: Path | None, default_rel: Path) -> Path:
        if override is None:
            return src / default_rel
        return override if override.is_absolute() else src / override

    def prefixed(base: str) -> str:
        return f"{prefix}_{base}" if prefix else base

    layers = out / OUT_LAYERS_DIRNAME
    data = out / OUT_DATA_DIRNAME
    dem_in_resolved = under_src(dem, REL_DEM)

    return PipelinePaths(
        src=src,
        out=out,
        dem_in=dem_in_resolved,
        slope_in=under_src(slope, REL_SLOPE),
        lyrx=under_src(lyrx, REL_LYRX),
        ellipse_shp=under_src(ellipse, REL_ELLIPSE),
        nac_mosaic=under_src(nac_mosaic, REL_NAC_MOSAIC),
        nac_frames_dir=under_src(nac_frames, REL_NAC_FRAMES),
        layers=layers,
        data=data,
        dem_out=data / dem_output_name(dem_in_resolved),
        ellipse_out=data / OUT_ELLIPSE_NAME,
        nac_layer=layers / prefixed(OUT_NAC_LAYER_NAME),
        slope_layer=layers / prefixed(OUT_SLOPE_LAYER_NAME),
        slope_rgba=out / OUT_SLOPE_RGBA_NAME,
        layer_prefix=prefix,
    )
