"""Generate the Earth grid reference corpus used by the AEGIS TypeScript LGRS tests.

WGS84 UTM/UPS projection comes from pyproj, 100 km square IDs from the PyPI `mgrs`
package (GeoTrans), and zone classification and ACC labels from an independent
implementation of docs/lgrs-earth-plan.md §3.

Run from the repository root with ``npm run lgrs:reference-corpus-earth`` (an alias for
``uv run --project scripts/lgrs-reference earth``).
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import platform
import random
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

import mgrs
import pyproj
from pyproj import Transformer

FIXTURE_VERSION = "v1"
COMMAND = "npm run lgrs:reference-corpus-earth"
SEED = 5_002_026
PINNED = {"pyproj": "3.8.0", "mgrs": "1.7.0"}
PINNED_PROJ = "9.8.1"

ACC_PRECISIONS = (25_000, 1000, 100, 10, 1)
MGRS_PRECISIONS = (100_000, 10_000, 1000, 100, 10, 1)
ALL_PRECISIONS = (100_000, 25_000, 10_000, 1000, 100, 10, 1)
BOX_PRECISIONS = (100_000, 25_000, 10_000, 1000, 100, 10)

SEEDED_GLOBAL_COUNT = 2000
SEEDED_POLAR_COUNT = 400
SEEDED_SITE_COUNT = 20
CLASSIFICATION_SEEDED_COUNT = 1000
PROJECTION_GLOBAL_COUNT = 2500
PROJECTION_POLAR_COUNT = 600
PROJECTION_NEIGHBOUR_COUNT = 600
BOX_RANDOM_PER_PRECISION = 3

WGS84_A = 6_378_137.0
MM = 0.001
MM_LAT_DEG = math.degrees(MM / WGS84_A)
UTM_MIN_LAT = -80.0
UTM_MAX_LAT = 84.0
UPS_FALSE_ORIGIN = 2_000_000

BANDS = "CDEFGHJKLMNPQRSTUVWX"
UTM_COLUMN_SETS = ("ABCDEFGH", "JKLMNPQR", "STUVWXYZ")
UTM_ROWS = "ABCDEFGHJKLMNPQRSTUV"
UPS_ROWS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
# GeoTrans polar tables. Band → (column letters, first column easting, row letters,
# first row northing).
UPS_TABLES = {
    "A": ("JKLPQRSTUXYZ", 800_000, UPS_ROWS, 800_000),
    "B": ("ABCFGHJKLPQR", 2_000_000, UPS_ROWS, 800_000),
    "Y": ("JKLPQRSTUXYZ", 800_000, UPS_ROWS[:14], 1_300_000),
    "Z": ("ABCFGHJ", 2_000_000, UPS_ROWS[:14], 1_300_000),
}
SUB_AREA_LETTERS = "ABCD"
KM_LETTERS = "-ABCDEFGHJKLMNPQRSTUVWXYZ"

PLAN_EXAMPLES = (
    # lat, lon, UTM, E, N (2 dp), MGRS 10 m, ACC full 10 m
    (
        29.5593,
        -95.0900,
        "15N",
        297_516.44,
        3_271_776.23,
        "15R TN 9751 7177",
        "15RTNDC X51 W77",
    ),
    (
        29.25,
        -103.25,
        "13N",
        670_052.04,
        3_236_953.18,
        "13R FN 7005 3695",
        "13RFNCB V05 L95",
    ),
    (
        64.80,
        -17.00,
        "28N",
        404_994.40,
        7_187_665.84,
        "28W DS 0499 8766",
        "28WDSAD D99 M66",
    ),
    (0.0001, -179.9999, "1N", 166_032.59, 11.07, "1N AA 6603 0001", "1NAACA R03 -01"),
)

# Approximate analog field sites, sampled within 30 km: the USGS training-grid sites
# (plan §2.1) plus Svalbard and Bergen for the zone exceptions.
ANALOG_SITES = (
    ("yucca-flat", 37.05, -116.05),
    ("buffalo-park", 35.2, -111.6),
    ("cinder-lake", 35.25, -111.47),
    ("meteor-crater", 35.03, -111.02),
    ("haats", 39.65, -106.95),
    ("jsc", 29.5593, -95.09),
    ("big-bend", 29.25, -103.25),
    ("iceland-highlands", 64.8, -17.0),
    ("svalbard", 78.22, 15.65),
    ("norway-bergen", 60.39, 5.32),
)

MGRS = mgrs.MGRS()


# * CRS. ───────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Crs:
    system: str
    zone: int | None
    hemisphere: str

    @property
    def crs_id(self) -> int:
        if self.system == "UPS":
            return 0 if self.hemisphere == "S" else 1
        return 2 + (self.zone - 1) * 2 + (1 if self.hemisphere == "S" else 0)

    @property
    def epsg(self) -> int:
        if self.system == "UPS":
            return 32761 if self.hemisphere == "S" else 32661
        return (32700 if self.hemisphere == "S" else 32600) + self.zone

    @property
    def name(self) -> str:
        if self.system == "UPS":
            return f"UPS {self.hemisphere}"
        return f"{self.zone}{self.hemisphere}"


UPS_S = Crs("UPS", None, "S")
UPS_N = Crs("UPS", None, "N")


def utm(zone: int, hemisphere: str) -> Crs:
    return Crs("UTM", zone, hemisphere)


def crs_from_id(crs_id: int) -> Crs:
    if crs_id == 0:
        return UPS_S
    if crs_id == 1:
        return UPS_N
    return utm((crs_id - 2) // 2 + 1, "S" if (crs_id - 2) % 2 else "N")


def crs_fields(crs: Crs) -> dict:
    return {
        "crsId": crs.crs_id,
        "system": crs.system,
        "zone": crs.zone,
        "hemisphere": crs.hemisphere,
    }


# * CLASSIFICATION (§3.1, §8.1). ───────────────────────────────────────


def conform_longitude(lon: float) -> float:
    if -180.0 <= lon < 180.0:
        return lon
    return (lon + 180.0) % 360.0 - 180.0


def utm_band_index(lat: float) -> int:
    """Exact band index for -80 <= lat < 84; band X (19) owns [72, 84)."""
    k = math.floor((lat + 80.0) / 8.0)
    while k > 0 and lat < -80 + 8 * k:
        k -= 1
    while lat >= -80 + 8 * (k + 1):
        k += 1
    return min(max(k, 0), 19)


def utm_band_letter(lat: float) -> str:
    """Band from latitude, clamped to C..X for box centres beyond the UTM range."""
    return BANDS[utm_band_index(min(max(lat, UTM_MIN_LAT), UTM_MAX_LAT))]


def standard_zone(lon: float) -> int:
    """Exact zone 1..60 for a conformed longitude: z owns [6z - 186, 6z - 180)."""
    k = math.floor((lon + 180.0) / 6.0)
    while k > 0 and lon < -180 + 6 * k:
        k -= 1
    while k < 59 and lon >= -180 + 6 * (k + 1):
        k += 1
    return k + 1


@dataclass(frozen=True)
class Classification:
    crs: Crs
    band: str | None
    longitude: float


def classify(lat: float, lon: float) -> Classification | None:
    if not (math.isfinite(lat) and math.isfinite(lon)) or lat < -90 or lat > 90:
        return None
    lon = conform_longitude(lon)
    north = lat >= 0
    if lat >= UTM_MAX_LAT:
        return Classification(UPS_N, None, lon)
    if lat < UTM_MIN_LAT:
        return Classification(UPS_S, None, lon)
    band = BANDS[utm_band_index(lat)]
    zone = standard_zone(lon)
    if band == "V" and zone == 31 and lon >= 3:
        zone = 32
    elif band == "X":
        if zone == 32:
            zone = 31 if lon < 9 else 33
        elif zone == 34:
            zone = 33 if lon < 21 else 35
        elif zone == 36:
            zone = 35 if lon < 33 else 37
    return Classification(utm(zone, "N" if north else "S"), band, lon)


# * PROJECTION (pyproj). ───────────────────────────────────────────────


@cache
def forward_transformer(epsg: int) -> Transformer:
    return Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)


@cache
def inverse_transformer(epsg: int) -> Transformer:
    return Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)


def project(crs: Crs, lat: float, lon: float) -> tuple[float, float]:
    e, n = forward_transformer(crs.epsg).transform(conform_longitude(lon), lat)
    if not (math.isfinite(e) and math.isfinite(n)):
        raise ValueError(f"pyproj cannot project {lat}, {lon} into {crs.name}")
    return e, n


def unproject(crs: Crs, e: float, n: float) -> tuple[float, float]:
    lon, lat = inverse_transformer(crs.epsg).transform(e, n)
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise ValueError(f"pyproj cannot unproject {e}, {n} in {crs.name}")
    return lat, conform_longitude(lon)


def in_region(crs: Crs, e: float, n: float) -> bool:
    try:
        lat, lon = unproject(crs, e, n)
    except ValueError:
        return False
    found = classify(lat, lon)
    return found is not None and found.crs == crs


# * LABELS (§3.2, §3.3). ───────────────────────────────────────────────


def floor_int(value: float, precision: int) -> int:
    """Exact floor(value / precision) for a double value (no division rounding)."""
    k = math.floor(value / precision)
    if k * precision > value:
        k -= 1
    elif (k + 1) * precision <= value:
        k += 1
    return int(k)


def ups_band(crs: Crs, ve: int) -> str:
    if crs.hemisphere == "N":
        return "Y" if ve < UPS_FALSE_ORIGIN else "Z"
    return "A" if ve < UPS_FALSE_ORIGIN else "B"


def own_square_id(crs: Crs, ve: int, vn: int) -> str | None:
    """2-letter 100 km square ID from integer metres, independent of `mgrs`."""
    if crs.system == "UTM":
        column = ve // 100_000
        if not 1 <= column <= 8:
            return None
        row = (vn % 2_000_000) // 100_000 + (5 if crs.zone % 2 == 0 else 0)
        return UTM_COLUMN_SETS[(crs.zone - 1) % 3][column - 1] + UTM_ROWS[row % 20]
    columns, column_origin, rows, row_origin = UPS_TABLES[ups_band(crs, ve)]
    column = (ve - column_origin) // 100_000
    row = (vn - row_origin) // 100_000
    if not (0 <= column < len(columns) and 0 <= row < len(rows)):
        return None
    return columns[column] + rows[row]


@dataclass
class SquareStats:
    package: int = 0
    own_only: int = 0
    other_crs: int = 0
    disagreements: list[dict] = field(default_factory=list)


SQUARE_STATS = SquareStats()
SQUARE_QUERY_INSET = 0.01


def package_square_id(crs: Crs, e: float, n: float) -> str | None:
    """Square ID from `mgrs` for (e, n), or None if it answers for another CRS.

    The query point is clamped 1 cm inside the point's 100 km square, clear of
    GeoTrans's sub-millimetre rounding at square edges.
    """
    ve, vn = floor_int(e, 100_000) * 100_000, floor_int(n, 100_000) * 100_000
    qe = min(max(e, ve + SQUARE_QUERY_INSET), ve + 100_000 - SQUARE_QUERY_INSET)
    qn = min(max(n, vn + SQUARE_QUERY_INSET), vn + 100_000 - SQUARE_QUERY_INSET)
    try:
        if crs.system == "UTM":
            text = MGRS.UTMToMGRS(crs.zone, crs.hemisphere, qe, qn, 0)
            if len(text) == 5 and text[:2].isdigit() and int(text[:2]) == crs.zone:
                return text[3:]
            SQUARE_STATS.other_crs += 1
            return None
        lat, lon = unproject(crs, qe, qn)
        text = MGRS.toMGRS(lat, lon, MGRSPrecision=0)
    except (mgrs.core.MGRSError, ValueError):
        return None
    if len(text) == 3 and text[0] == ups_band(crs, floor_int(e, 1)):
        return text[1:]
    SQUARE_STATS.other_crs += 1
    return None


def square_id(crs: Crs, e: float, n: float) -> str | None:
    own = own_square_id(crs, floor_int(e, 1), floor_int(n, 1))
    package = package_square_id(crs, e, n)
    if package is None:
        SQUARE_STATS.own_only += 0 if own is None else 1
        return own
    SQUARE_STATS.package += 1
    if own != package:
        SQUARE_STATS.disagreements.append(
            {"crs": crs.name, "easting": e, "northing": n, "own": own, "mgrs": package}
        )
    return package


def digit_count(precision: int, top: int) -> int:
    return round(math.log10(top // precision))


def acc_prefix(crs: Crs, band: str, square: str, ve: int, vn: int) -> str:
    sub_e = SUB_AREA_LETTERS[(ve % 100_000) // 25_000]
    sub_n = SUB_AREA_LETTERS[(vn % 100_000) // 25_000]
    zone = "" if crs.system == "UPS" else str(crs.zone)
    return f"{zone}{band}{square}{sub_e}{sub_n}"


def acc_axis(v: int, precision: int) -> str:
    letter = KM_LETTERS[(v % 25_000) // 1000]
    count = digit_count(precision, 1000)
    return letter + (f"{(v % 1000) // precision:0{count}d}" if count else "")


def acc_label(prefix: str, ve: int, vn: int, precision: int) -> dict:
    if precision == 25_000:
        return {"condensed": prefix, "full": prefix}
    condensed = f"{acc_axis(ve, precision)} {acc_axis(vn, precision)}"
    return {"condensed": condensed, "full": f"{prefix} {condensed}"}


def mgrs_label(
    crs: Crs, band: str, square: str, ve: int, vn: int, precision: int
) -> str:
    zone = "" if crs.system == "UPS" else str(crs.zone)
    head = f"{zone}{band} {square}"
    count = digit_count(precision, 100_000)
    if not count:
        return head
    e = (ve % 100_000) // precision
    n = (vn % 100_000) // precision
    return f"{head} {e:0{count}d} {n:0{count}d}"


def band_for(crs: Crs, ve: int, latitude: float) -> str:
    return ups_band(crs, ve) if crs.system == "UPS" else utm_band_letter(latitude)


def labels_at(crs: Crs, e: float, n: float, latitude: float) -> dict | None:
    """Labels at every precision: digits from floor of E/N, band from `latitude`."""
    ve, vn = floor_int(e, 1), floor_int(n, 1)
    square = square_id(crs, e, n)
    if square is None:
        return None
    band = band_for(crs, ve, latitude)
    prefix = acc_prefix(crs, band, square, ve, vn)
    return {
        "band": band,
        "square": square,
        "accPrefix": prefix,
        "acc": {str(p): acc_label(prefix, ve, vn, p) for p in ACC_PRECISIONS},
        "mgrs": {
            str(p): mgrs_label(crs, band, square, ve, vn, p) for p in MGRS_PRECISIONS
        },
    }


def boundary_distance(value: float, precision: int) -> float:
    k = floor_int(value, precision)
    return min(value - k * precision, (k + 1) * precision - value)


def boundary_distances(e: float, n: float) -> dict:
    return {
        str(p): min(boundary_distance(e, p), boundary_distance(n, p))
        for p in ALL_PRECISIONS
    }


# * MGRS PACKAGE CROSS-CHECK. ──────────────────────────────────────────


@dataclass
class PackageCheck:
    checked: int = 0
    by_kind: dict = field(default_factory=dict)

    def record(self, kind: str, example: dict) -> None:
        entry = self.by_kind.setdefault(
            kind,
            {
                "count": 0,
                "maxSeamDistanceDegrees": 0.0,
                "maxBoundaryDistanceMeters": 0.0,
                "categories": {},
                "examples": [],
            },
        )
        entry["count"] += 1
        for key, value in (
            ("maxSeamDistanceDegrees", example["seamDistanceDegrees"]),
            ("maxBoundaryDistanceMeters", example["boundaryDistanceMeters"]),
        ):
            entry[key] = max(entry[key], value)
        category = example["category"]
        if category not in entry["categories"]:
            entry["examples"].append(example)
        entry["categories"][category] = entry["categories"].get(category, 0) + 1


PACKAGE_CHECK = PackageCheck()


def parse_package_mgrs(text: str) -> tuple[str, str, str]:
    """(zone/band head, square, 10 digits) from a precision-5 mgrs package string."""
    if text[0].isdigit():
        return str(int(text[:2])) + text[2], text[3:5], text[5:]
    return text[0], text[1:3], text[3:]


def cross_check_package(
    category: str, lat: float, lon: float, crs: Crs, labels: dict, e: float, n: float
) -> None:
    PACKAGE_CHECK.checked += 1
    ours_head = ("" if crs.system == "UPS" else str(crs.zone)) + labels["band"]
    ve, vn = floor_int(e, 1), floor_int(n, 1)
    ours_digits = f"{ve % 100_000:05d}{vn % 100_000:05d}"
    example = {
        "category": category,
        "latitude": lat,
        "longitude": lon,
        "seamDistanceDegrees": min(abs(lat - UTM_MAX_LAT), abs(lat - UTM_MIN_LAT)),
        "boundaryDistanceMeters": min(boundary_distance(e, 1), boundary_distance(n, 1)),
        "ours": None,
        "mgrs": None,
    }
    try:
        text = MGRS.toMGRS(lat, lon, MGRSPrecision=5)
    except mgrs.core.MGRSError as error:
        PACKAGE_CHECK.record("error", {**example, "mgrs": str(error)})
        return
    head, square, digits = parse_package_mgrs(text)
    ours = f"{ours_head}{labels['square']}{ours_digits}"
    example = {**example, "ours": ours, "mgrs": text}
    if head != ours_head:
        PACKAGE_CHECK.record("zoneOrBand", example)
    elif square != labels["square"]:
        PACKAGE_CHECK.record("square", example)
    elif digits != ours_digits:
        PACKAGE_CHECK.record("digits1m", example)


# * SAMPLING HELPERS. ──────────────────────────────────────────────────


def area_weighted_latitude(
    rng: random.Random, low: float = -90, high: float = 90
) -> float:
    lo = math.sin(math.radians(low))
    hi = math.sin(math.radians(high))
    return math.degrees(math.asin(lo + (hi - lo) * rng.random()))


def random_longitude(rng: random.Random) -> float:
    return -180 + 360 * rng.random()


def mm_lon_deg(lat: float) -> float:
    return math.degrees(MM / (WGS84_A * max(math.cos(math.radians(lat)), 1e-9)))


def offsets(value: float, step: float) -> Iterable[tuple[float, str]]:
    return ((value - step, "below-1mm"), (value, "exact"), (value + step, "above-1mm"))


def central_meridian(zone: int) -> float:
    return -183 + 6 * zone


# * BOUNDARY POINTS (lat/lon). ─────────────────────────────────────────

ZONE_LATITUDES = (-77.5, -41.3, -3.7, 2.2, 33.3, 61.0, 70.1, 80.5)
BAND_LONGITUDES = (-179.0, -95.5, -16.9, 0.5, 4.5, 10.0, 77.7, 150.25)
SEAM_LONGITUDES = (
    -180.0,
    -135.0,
    -93.0,
    -45.0,
    -0.5,
    0.0,
    4.5,
    15.0,
    27.0,
    39.0,
    90.0,
    179.5,
)


def zone_meridian_points(rng: random.Random) -> list[tuple[float, float, str]]:
    points = []
    for lat in ZONE_LATITUDES:
        step = mm_lon_deg(lat)
        for lon, kind in (
            (180.0 - step, "below-1mm"),
            (-180.0, "exact"),
            (-180.0 + step, "above-1mm"),
            (180.0, "exact-conformed"),
        ):
            points.append((lat, lon, f"antimeridian-{kind}"))
    for k in range(1, 60):
        meridian = -180.0 + 6 * k
        for lat in rng.sample(ZONE_LATITUDES, 2):
            for lon, kind in offsets(meridian, mm_lon_deg(lat)):
                points.append((lat, lon, f"zone-meridian-{kind}"))
    return points


def band_parallel_points() -> list[tuple[float, float, str]]:
    points = []
    for k in range(20):
        parallel = -80.0 + 8 * k
        if parallel == 0:
            category = "equator"
        elif parallel == -80:
            category = "utm-ups-seam-south"
        else:
            category = "band-parallel"
        for lon in BAND_LONGITUDES:
            for lat, kind in offsets(parallel, MM_LAT_DEG):
                points.append((lat, lon, f"{category}-{kind}"))
    for lon in SEAM_LONGITUDES:
        for parallel, category in (
            (84.0, "utm-ups-seam-north"),
            (-80.0, "utm-ups-seam-south"),
        ):
            for lat, kind in offsets(parallel, MM_LAT_DEG):
                points.append((lat, lon, f"{category}-{kind}"))
    # Inside band X (72-84 N) 80 N is not a boundary.
    points += [(80.0, lon, "band-x-interior") for lon in BAND_LONGITUDES]
    return points


def pole_points() -> list[tuple[float, float, str]]:
    points = []
    for lon in (-180.0, -135.0, -90.0, 0.0, 45.0, 90.0, 179.0):
        points.append((90.0, lon, "pole-north-exact"))
        points.append((-90.0, lon, "pole-south-exact"))
        points.append((90.0 - MM_LAT_DEG, lon, "pole-north-1mm"))
        points.append((-90.0 + MM_LAT_DEG, lon, "pole-south-1mm"))
    return points


def ups_split_points() -> list[tuple[float, float, str]]:
    """Points on and 1 mm either side of the UPS band split (E = 2,000,000)."""
    points = []
    for lat in (84.5, 86.0, 89.0, -80.5, -84.0, -89.0):
        step = mm_lon_deg(lat)
        for meridian in (0.0, -180.0):
            hemisphere = "north" if lat > 0 else "south"
            for lon, kind in offsets(meridian, step):
                lon = conform_longitude(lon)
                points.append((lat, lon, f"ups-{hemisphere}-split-{kind}"))
    return points


def exception_points() -> list[tuple[float, float, str]]:
    points = []

    def meridian(lon: float, lats: Iterable[float], name: str) -> None:
        for lat in lats:
            for value, kind in offsets(lon, mm_lon_deg(lat)):
                points.append((lat, value, f"{name}-{kind}"))

    def parallel(lat: float, lons: Iterable[float], name: str) -> None:
        for lon in lons:
            for value, kind in offsets(lat, MM_LAT_DEG):
                points.append((value, lon, f"{name}-{kind}"))

    def corner(lat: float, lon: float, name: str) -> None:
        for la, _ in offsets(lat, MM_LAT_DEG):
            for lo, _ in offsets(lon, mm_lon_deg(lat)):
                points.append((la, lo, f"{name}-corner"))

    # Norway: 32V owns 56-64 N, 3-12 E; 31V shrinks to 0-3 E.
    meridian(3.0, (56.0, 57.5, 60.0, 63.9), "norway-3e")
    meridian(12.0, (56.5, 60.0, 63.9), "norway-12e")
    meridian(0.0, (56.5, 60.0, 63.9), "norway-0e")
    meridian(6.0, (57.0, 60.0, 63.0), "norway-6e-interior")
    parallel(56.0, (1.5, 4.5, 9.0, 13.5), "norway-56n")
    parallel(64.0, (1.5, 4.5, 9.0, 13.5), "norway-64n")
    for lat in (56.0, 64.0):
        for lon in (0.0, 3.0, 12.0):
            corner(lat, lon, "norway")
    # Svalbard: 31X 0-9, 33X 9-21, 35X 21-33, 37X 33-42; 32X/34X/36X don't exist.
    for lon in (9.0, 21.0, 33.0):
        meridian(lon, (72.5, 78.0, 83.9), f"svalbard-{int(lon)}e")
    meridian(0.0, (72.5, 78.0), "svalbard-0e")
    meridian(42.0, (72.5, 78.0, 83.9), "svalbard-42e")
    for lon in (6.0, 12.0, 18.0, 24.0, 30.0, 36.0):
        meridian(lon, (78.0,), "svalbard-interior")
    parallel(
        72.0,
        (4.5, 7.5, 10.5, 15.0, 19.5, 22.5, 27.0, 31.5, 34.5, 39.0, 41.5),
        "svalbard-72n",
    )
    parallel(84.0, (4.5, 15.0, 27.0, 39.0), "svalbard-84n")
    for lon in (0.0, 9.0, 21.0, 33.0, 42.0):
        corner(72.0, lon, "svalbard")
        corner(84.0, lon, "svalbard")
    return points


def ulp_points() -> list[tuple[float, float, str]]:
    """Doubles adjacent to exact boundaries (classification only)."""
    points = []
    for k in range(1, 60):
        meridian = -180.0 + 6 * k
        for lat in (10.0, -50.0):
            points.append(
                (lat, math.nextafter(meridian, -math.inf), "ulp-zone-meridian-below")
            )
            points.append(
                (lat, math.nextafter(meridian, math.inf), "ulp-zone-meridian-above")
            )
    points.append((10.0, math.nextafter(-180.0, math.inf), "ulp-antimeridian-above"))
    points.append((10.0, math.nextafter(180.0, -math.inf), "ulp-antimeridian-below"))
    for k in range(20):
        parallel = -80.0 + 8 * k
        for lon in (-95.5, 77.7):
            points.append(
                (math.nextafter(parallel, -math.inf), lon, "ulp-band-parallel-below")
            )
            points.append(
                (math.nextafter(parallel, math.inf), lon, "ulp-band-parallel-above")
            )
    points.append(
        (math.nextafter(84.0, -math.inf), 10.0, "ulp-utm-ups-seam-north-below")
    )
    points.append(
        (math.nextafter(84.0, math.inf), 10.0, "ulp-utm-ups-seam-north-above")
    )
    points.append((math.nextafter(90.0, -math.inf), 10.0, "ulp-north-pole-below"))
    points.append((math.nextafter(-90.0, math.inf), 10.0, "ulp-south-pole-above"))
    for lon, lats in (
        (3.0, (60.0,)),
        (12.0, (60.0,)),
        (9.0, (78.0,)),
        (21.0, (78.0,)),
        (33.0, (78.0,)),
    ):
        for lat in lats:
            points.append(
                (lat, math.nextafter(lon, -math.inf), "ulp-exception-meridian-below")
            )
            points.append(
                (lat, math.nextafter(lon, math.inf), "ulp-exception-meridian-above")
            )
    for lat, lon in ((56.0, 4.5), (64.0, 4.5), (72.0, 7.5), (72.0, 10.5)):
        points.append(
            (math.nextafter(lat, -math.inf), lon, "ulp-exception-parallel-below")
        )
        points.append(
            (math.nextafter(lat, math.inf), lon, "ulp-exception-parallel-above")
        )
    return points


SPECIAL_CLASSIFICATION = (
    (-0.0, 10.0, "negative-zero-latitude"),
    (10.0, -0.0, "negative-zero-longitude"),
    (90.0000001, 0.0, "invalid-latitude"),
    (-90.5, 10.0, "invalid-latitude"),
    (123.0, -45.0, "invalid-latitude"),
    (10.0, 180.0, "longitude-conformation"),
    (10.0, 540.0, "longitude-conformation"),
    (10.0, -540.0, "longitude-conformation"),
    (10.0, -180.5, "longitude-conformation"),
    (10.0, 186.5, "longitude-conformation"),
    (60.0, 363.5, "longitude-conformation"),
    (78.0, -339.0, "longitude-conformation"),
    (-45.0, 720.0, "longitude-conformation"),
)


def boundary_points(rng: random.Random) -> list[tuple[float, float, str]]:
    return (
        zone_meridian_points(rng)
        + band_parallel_points()
        + pole_points()
        + ups_split_points()
        + exception_points()
    )


def plan_and_seeded_points(rng: random.Random) -> list[tuple[float, float, str]]:
    points = [(lat, lon, "plan-example") for lat, lon, *_ in PLAN_EXAMPLES]
    points += [
        (area_weighted_latitude(rng), random_longitude(rng), "seeded-global")
        for _ in range(SEEDED_GLOBAL_COUNT)
    ]
    for index in range(SEEDED_POLAR_COUNT):
        low, high = (70, 90) if index % 2 else (-90, -70)
        points.append(
            (
                area_weighted_latitude(rng, low, high),
                random_longitude(rng),
                "seeded-polar",
            )
        )
    for name, lat, lon in ANALOG_SITES:
        for _ in range(SEEDED_SITE_COUNT):
            distance = 30_000 * math.sqrt(rng.random())
            bearing = 2 * math.pi * rng.random()
            d_lat = math.degrees(distance * math.cos(bearing) / WGS84_A)
            d_lon = mm_lon_deg(lat) * distance * math.sin(bearing) / MM
            points.append((lat + d_lat, lon + d_lon, f"site-{name}"))
    return points


# * SAMPLE CRSs FOR BOX-LINE CASES. ────────────────────────────────────

# (crs, reference latitude, reference longitude). Zones 13-18 cover all three
# column-letter sets with both row-offset parities, in both hemispheres.
SAMPLE_UTM = (
    (utm(13, "N"), 29.25, -103.25),
    (utm(14, "N"), 31.0, -99.0),
    (utm(15, "N"), 29.5593, -95.09),
    (utm(16, "N"), 45.0, -87.0),
    (utm(17, "N"), 2.0, -81.0),
    (utm(18, "N"), 70.0, -75.0),
    (utm(13, "S"), -20.0, -105.0),
    (utm(14, "S"), -60.0, -99.0),
    (utm(15, "S"), -2.0, -93.0),
    (utm(16, "S"), -35.0, -87.0),
    (utm(17, "S"), -77.0, -81.0),
    (utm(18, "S"), -45.0, -75.0),
    (utm(1, "N"), 0.5, -177.5),
    (utm(60, "S"), -40.0, 175.0),
    (utm(28, "N"), 64.8, -17.0),
    (utm(31, "N"), 60.0, 1.5),
    (utm(32, "N"), 60.0, 7.5),
    (utm(33, "N"), 78.2, 15.6),
)
SAMPLE_UPS = (
    (UPS_N, 86.0, -60.0),  # Y
    (UPS_N, 86.0, 60.0),  # Z
    (UPS_S, -84.0, -60.0),  # A
    (UPS_S, -84.0, 60.0),  # B
)
SAMPLE_CRS = SAMPLE_UTM + SAMPLE_UPS


# * (a) CLASSIFICATION. ────────────────────────────────────────────────


def classification_case(lat: float, lon: float, category: str) -> dict:
    found = classify(lat, lon)
    expected = None
    if found is not None:
        expected = {
            **crs_fields(found.crs),
            "band": found.band,
            "conformedLongitude": found.longitude,
        }
    return {
        "category": category,
        "latitude": lat,
        "longitude": lon,
        "expected": expected,
    }


def classification_cases(boundary: list[tuple[float, float, str]]) -> dict:
    rng = random.Random(SEED + 1)
    points = [(lat, lon, "plan-example") for lat, lon, *_ in PLAN_EXAMPLES]
    points += boundary + ulp_points() + list(SPECIAL_CLASSIFICATION)
    points += [
        (area_weighted_latitude(rng), random_longitude(rng), "seeded-global")
        for _ in range(CLASSIFICATION_SEEDED_COUNT)
    ]
    return {"cases": [classification_case(*point) for point in points]}


# * (b) PROJECTION. ────────────────────────────────────────────────────


def projection_case(lat: float, lon: float, crs: Crs, category: str) -> dict:
    e, n = project(crs, lat, lon)
    inverse_lat, inverse_lon = unproject(crs, e, n)
    found = classify(lat, lon)
    return {
        "category": category,
        "latitude": lat,
        "longitude": lon,
        "crsId": crs.crs_id,
        "inRegion": found is not None and found.crs == crs,
        "expected": {
            "easting": e,
            "northing": n,
            "inverseLatitude": inverse_lat,
            "inverseLongitude": inverse_lon,
        },
    }


def neighbour_crs(rng: random.Random) -> tuple[float, float, Crs]:
    """A point within a few degrees of a region edge, and the CRS across that edge."""
    kind = rng.randrange(4)
    if kind < 2:
        zone = rng.randrange(1, 61)
        edge = -180 + 6 * (zone - 1)
        lat = area_weighted_latitude(rng, -79.9, 71.9)
        lon = conform_longitude(
            edge - 3 * rng.random() if kind == 0 else edge + 3 * rng.random()
        )
        target = zone if kind == 0 else (zone - 2) % 60 + 1
        return lat, lon, utm(target, "N" if lat >= 0 else "S")
    if kind == 2:
        lat = rng.uniform(-0.5, 0.5)
        lon = random_longitude(rng)
        zone = standard_zone(lon)
        return lat, lon, utm(zone, "S" if lat >= 0 else "N")
    north = rng.random() < 0.5
    lon = random_longitude(rng)
    if north:
        lat = rng.uniform(82.0, 86.0)
        crs = UPS_N if lat < 84 else utm(standard_zone(lon), "N")
    else:
        lat = rng.uniform(-82.0, -78.0)
        crs = UPS_S if lat >= -80 else utm(standard_zone(lon), "S")
    return lat, lon, crs


def projection_cases(boundary: list[tuple[float, float, str]]) -> dict:
    rng = random.Random(SEED + 2)
    cases = []
    points = [(lat, lon, "plan-example") for lat, lon, *_ in PLAN_EXAMPLES]
    points += [
        (area_weighted_latitude(rng), random_longitude(rng), "seeded-global")
        for _ in range(PROJECTION_GLOBAL_COUNT)
    ]
    for index in range(PROJECTION_POLAR_COUNT):
        low, high = (70, 90) if index % 2 else (-90, -70)
        points.append(
            (
                area_weighted_latitude(rng, low, high),
                random_longitude(rng),
                "seeded-polar",
            )
        )
    points += boundary
    for lat, lon, category in points:
        found = classify(lat, lon)
        cases.append(projection_case(lat, lon, found.crs, category))
    for _ in range(PROJECTION_NEIGHBOUR_COUNT):
        lat, lon, crs = neighbour_crs(rng)
        cases.append(projection_case(lat, lon, crs, "neighbour-crs"))
    return {"cases": cases}


# * (c) FORMATTING FROM CRS + E/N. ─────────────────────────────────────


def point_format_case(
    crs: Crs, e: float, n: float, kind: str, line_precision: int | None = None
) -> dict | None:
    lat, _ = unproject(crs, e, n)
    labels = labels_at(crs, e, n, lat)
    if labels is None:
        return None
    line = {} if line_precision is None else {"linePrecision": line_precision}
    return {
        "category": f"{crs.system.lower()}-{kind}",
        **line,
        "crsId": crs.crs_id,
        "easting": e,
        "northing": n,
        "latitude": lat,
        "inRegion": in_region(crs, e, n),
        "expected": labels,
    }


def line_values(
    center: float, precision: int, rng: random.Random, count: int
) -> list[int]:
    base = floor_int(center, precision)
    spread = max(1, min(40, 100_000 // precision))
    return [(base + rng.randint(-spread, spread)) * precision for _ in range(count)]


def point_format_cases() -> dict:
    rng = random.Random(SEED + 3)
    cases: list[dict | None] = []
    for crs, lat, lon in SAMPLE_CRS:
        e0, n0 = project(crs, lat, lon)
        for p in ALL_PRECISIONS:
            e_line, n_line = (
                line_values(e0, p, rng, 1)[0],
                line_values(n0, p, rng, 1)[0],
            )
            free_e = round(e0 + rng.uniform(-50_000, 50_000), 3)
            free_n = round(n0 + rng.uniform(-50_000, 50_000), 3)
            variants = (
                (float(e_line), free_n, "e-line-exact"),
                (free_e, float(n_line), "n-line-exact"),
                (float(e_line), float(n_line), "corner-exact"),
                (e_line - MM, free_n, "e-line-below-1mm"),
                (e_line + MM, free_n, "e-line-above-1mm"),
                (free_e, n_line - MM, "n-line-below-1mm"),
                (free_e, n_line + MM, "n-line-above-1mm"),
                (math.nextafter(float(e_line), -math.inf), free_n, "e-line-ulp-below"),
                (free_e, math.nextafter(float(n_line), -math.inf), "n-line-ulp-below"),
            )
            for e, n, kind in variants:
                cases.append(point_format_case(crs, e, n, kind, p))
    # Equator and the 2,000 km row-letter cycle.
    for crs, lat, lon in SAMPLE_UTM[:12]:
        e0, _ = project(crs, lat, lon)
        e = round(e0, 3)
        if crs.hemisphere == "N":
            cases.append(point_format_case(crs, e, 0.0, "equator-exact", 100_000))
            cases.append(point_format_case(crs, e, MM, "equator-above-1mm", 100_000))
        else:
            cases.append(
                point_format_case(crs, e, 10_000_000 - MM, "equator-below-1mm", 100_000)
            )
            cases.append(
                point_format_case(crs, e, 10_000_000.0, "equator-exact", 100_000)
            )
        for cycle in (2_000_000, 4_000_000, 6_000_000, 8_000_000):
            for value, kind in offsets(float(cycle), MM):
                cases.append(
                    point_format_case(crs, e, value, f"row-cycle-{kind}", 100_000)
                )
    # UPS band split and pole lines.
    for crs in (UPS_N, UPS_S):
        origin = float(UPS_FALSE_ORIGIN)
        for other in (1_600_000.123, origin, 2_345_678.9):
            for value, kind in offsets(origin, MM):
                cases.append(
                    point_format_case(
                        crs, value, other, f"false-easting-{kind}", 100_000
                    )
                )
                cases.append(
                    point_format_case(
                        crs, other, value, f"false-northing-{kind}", 100_000
                    )
                )
            below = math.nextafter(origin, -math.inf)
            cases.append(
                point_format_case(crs, below, other, "false-easting-ulp-below", 100_000)
            )
    # Column and row sweeps through every letter of the six column-set/parity pairs.
    for crs, _, _ in SAMPLE_UTM[:12]:
        for column in range(2, 9):
            e = column * 100_000 + 31_234.5
            n = (100_000 if crs.hemisphere == "N" else 9_850_000) + 12_345.6
            cases.append(point_format_case(crs, e, n, "column-sweep"))
        start = 0 if crs.hemisphere == "N" else 1_000_000
        for row in range(20):
            n = start + row * 100_000 + 54_321.2
            cases.append(point_format_case(crs, 512_345.6, n, "row-sweep"))
    # Every UPS 100 km square that touches its cap.
    for crs in (UPS_N, UPS_S):
        limit_lat = UTM_MAX_LAT if crs.hemisphere == "N" else UTM_MIN_LAT
        _, edge_n = project(crs, limit_lat, 0.0)
        radius = abs(edge_n - UPS_FALSE_ORIGIN)
        for i in range(-12, 12):
            for j in range(-12, 12):
                e = UPS_FALSE_ORIGIN + i * 100_000
                n = UPS_FALSE_ORIGIN + j * 100_000
                near_e = min(max(UPS_FALSE_ORIGIN, e), e + 100_000)
                near_n = min(max(UPS_FALSE_ORIGIN, n), n + 100_000)
                if (
                    math.hypot(near_e - UPS_FALSE_ORIGIN, near_n - UPS_FALSE_ORIGIN)
                    >= radius
                ):
                    continue
                cases.append(
                    point_format_case(crs, e + 43_210.9, n + 56_789.1, "square-sweep")
                )
    return {"cases": [case for case in cases if case is not None]}


def box_case(
    crs: Crs, ll_e: int, ll_n: int, precision: int, category: str
) -> dict | None:
    if ll_e % precision or ll_n % precision:
        raise RuntimeError(
            f"{category}: lower-left {ll_e}, {ll_n} not a multiple of {precision}"
        )
    centre_lat, centre_lon = unproject(crs, ll_e + precision / 2, ll_n + precision / 2)
    square = square_id(crs, ll_e + precision / 2, ll_n + precision / 2)
    if square is None:
        return None
    band = band_for(crs, ll_e, centre_lat)
    prefix = acc_prefix(crs, band, square, ll_e, ll_n)
    found = classify(centre_lat, centre_lon)
    return {
        "category": category,
        "crsId": crs.crs_id,
        "precision": precision,
        "lowerLeft": [ll_e, ll_n],
        "centreLatitude": centre_lat,
        "centreInRegion": found is not None and found.crs == crs,
        "expected": {
            "band": band,
            "acc": (
                acc_label(prefix, ll_e, ll_n, precision)
                if precision in ACC_PRECISIONS
                else None
            ),
            "mgrs": (
                mgrs_label(crs, band, square, ll_e, ll_n, precision)
                if precision in MGRS_PRECISIONS
                else None
            ),
        },
    }


def box_at(
    crs: Crs, lat: float, lon: float, precision: int, category: str
) -> dict | None:
    e, n = project(crs, lat, lon)
    return box_case(
        crs,
        floor_int(e, precision) * precision,
        floor_int(n, precision) * precision,
        precision,
        category,
    )


def box_cases() -> dict:
    rng = random.Random(SEED + 4)
    cases: list[dict | None] = []
    for crs, lat, lon in SAMPLE_CRS:
        tag = crs.system.lower()
        for p in BOX_PRECISIONS:
            for _ in range(BOX_RANDOM_PER_PRECISION):
                spread = (0.4, 0.4) if crs.system == "UTM" else (1.5, 20.0)
                la = lat + rng.uniform(-spread[0], spread[0])
                lo = lon + rng.uniform(-spread[1], spread[1])
                cases.append(box_at(crs, la, lo, p, f"{tag}-interior"))
    # Partial boxes at zone edges: the centre may lie outside the region being drawn.
    for crs, lat, _ in SAMPLE_UTM:
        cm = central_meridian(crs.zone)
        west, east = cm - 3, cm + 3
        if crs.zone == 31 and 56 <= lat < 64:
            east = 3.0
        if crs.zone == 32 and 56 <= lat < 64:
            west = 3.0
        if crs.zone == 33 and lat >= 72:
            west, east = 9.0, 21.0
        for edge, side in ((west, "west"), (east, "east")):
            for p in (100_000, 25_000, 10_000, 1000):
                for offset in (-0.01, 0.01):
                    cases.append(
                        box_at(crs, lat, edge + offset, p, f"utm-zone-edge-{side}")
                    )
    # Boxes split by a band parallel, centre on either side.
    for crs, lat, lon in SAMPLE_UTM:
        parallel = -80 + 8 * utm_band_index(lat)
        for p in (100_000, 25_000, 10_000, 1000):
            for la in (parallel - 0.0001, parallel, parallel + 0.0001):
                if crs.hemisphere == "S" and la >= 0:
                    continue
                cases.append(box_at(crs, la, lon, p, "utm-band-parallel"))
    # Boxes at the UTM/UPS seams, with the centre beyond them (band clamped to X or C).
    for lon in (-93.0, 4.5, 15.0, 27.0, 39.0, 150.0):
        found = classify(83.99, lon)
        for p in (100_000, 25_000, 10_000):
            cases.append(box_at(found.crs, 83.99, lon, p, "utm-seam-north"))
        found = classify(-79.99, lon)
        for p in (100_000, 25_000, 10_000):
            cases.append(box_at(found.crs, -79.99, lon, p, "utm-seam-south"))
    # UPS: band split, cap edge, and every band.
    for crs in (UPS_N, UPS_S):
        cap_lat = UTM_MAX_LAT + 0.001 if crs.hemisphere == "N" else UTM_MIN_LAT - 0.001
        for p in BOX_PRECISIONS:
            # Boxes either side of the false easting split and the false northing line.
            for n in (UPS_FALSE_ORIGIN - p, UPS_FALSE_ORIGIN, UPS_FALSE_ORIGIN + p):
                for e in (UPS_FALSE_ORIGIN - p, UPS_FALSE_ORIGIN):
                    cases.append(box_case(crs, e, n, p, "ups-split"))
            for lon in (-135.0, -45.0, 45.0, 135.0):
                cases.append(box_at(crs, cap_lat, lon, p, "ups-cap-edge"))
    return {"cases": [case for case in cases if case is not None]}


# * (d) END TO END. ────────────────────────────────────────────────────


def end_to_end_case(
    lat: float, lon: float, category: str, line_precision: int | None = None
) -> dict | None:
    found = classify(lat, lon)
    if found is None:
        return None
    e, n = project(found.crs, lat, lon)
    labels = labels_at(found.crs, e, n, lat)
    if labels is None:
        raise RuntimeError(f"No square ID for {category} {lat}, {lon}")
    cross_check_package(category, lat, found.longitude, found.crs, labels, e, n)
    line = {} if line_precision is None else {"linePrecision": line_precision}
    return {
        "category": category,
        **line,
        "latitude": lat,
        "longitude": lon,
        "expected": {
            **crs_fields(found.crs),
            "easting": e,
            "northing": n,
            "boundaryDistance": boundary_distances(e, n),
            **labels,
        },
    }


def box_line_points(rng: random.Random) -> list[tuple[float, float, str, int]]:
    """Lat/lon 1 mm either side of 25 km and 100 km lines, via pyproj's inverse."""
    points = []
    for crs, lat, lon in SAMPLE_CRS:
        tag = crs.system.lower()
        e0, n0 = project(crs, lat, lon)
        for p in (100_000, 25_000):
            for axis in ("e", "n"):
                for _ in range(2):
                    line = line_values(e0 if axis == "e" else n0, p, rng, 1)[0]
                    if crs.system == "UTM":
                        line = line if axis == "n" else min(max(line, 200_000), 800_000)
                    free = (n0 if axis == "e" else e0) + rng.uniform(-20_000, 20_000)
                    for sign, kind in ((-1, "below-1mm"), (1, "above-1mm")):
                        value = line + sign * MM
                        e, n = (value, free) if axis == "e" else (free, value)
                        try:
                            la, lo = unproject(crs, e, n)
                        except ValueError:
                            continue
                        points.append((la, lo, f"box-line-{tag}-{axis}-{kind}", p))
    return points


def end_to_end_cases(boundary: list[tuple[float, float, str]]) -> dict:
    rng = random.Random(SEED + 5)
    points = plan_and_seeded_points(rng) + boundary + box_line_points(rng)
    cases = [end_to_end_case(*point) for point in points]
    return {"cases": [case for case in cases if case is not None]}


def check_plan_examples(cases: list[dict]) -> list[str]:
    failures = []
    examples = {(lat, lon): rest for lat, lon, *rest in PLAN_EXAMPLES}
    for case in cases:
        if case["category"] != "plan-example":
            continue
        crs_name, e, n, mgrs10, acc10 = examples[(case["latitude"], case["longitude"])]
        expected = case["expected"]
        got = (
            crs_from_id(expected["crsId"]).name,
            round(expected["easting"], 2),
            round(expected["northing"], 2),
            expected["mgrs"]["10"],
            expected["acc"]["10"]["full"],
        )
        want = (crs_name, e, n, mgrs10, acc10)
        if got != want:
            failures.append(f"{case['latitude']}, {case['longitude']}: {got} != {want}")
    return failures


# * OUTPUT. ────────────────────────────────────────────────────────────


def write_json(path: Path, value: dict) -> None:
    """Write top-level keys indented and one case per line, for reviewable diffs."""
    lines = ["{"]
    items = list(value.items())
    for index, (key, item) in enumerate(items):
        comma = "," if index < len(items) - 1 else ""
        if isinstance(item, list):
            lines.append(f"  {json.dumps(key)}: [")
            for row_index, row in enumerate(item):
                row_comma = "," if row_index < len(item) - 1 else ""
                lines.append(
                    f"    {json.dumps(row, separators=(', ', ': '))}{row_comma}"
                )
            lines.append(f"  ]{comma}")
        else:
            lines.append(f"  {json.dumps(key)}: {json.dumps(item)}{comma}")
    lines.append("}")
    with path.open("w", encoding="utf-8", newline="\n") as file:
        file.write("\n".join(lines) + "\n")


def count_categories(cases: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for case in cases:
        counts[case["category"]] = counts.get(case["category"], 0) + 1
    return dict(sorted(counts.items()))


def find_repo_root() -> Path:
    for parent in Path(__file__).resolve().parents:
        if (parent / "package.json").exists():
            return parent
    return Path.cwd()


def check_versions() -> dict:
    versions = {name: importlib.metadata.version(name) for name in PINNED}
    if versions != PINNED or pyproj.proj_version_str != PINNED_PROJ:
        raise RuntimeError(
            f"Expected {PINNED} with PROJ {PINNED_PROJ}, "
            f"found {versions} with PROJ {pyproj.proj_version_str}"
        )
    return {
        "python": platform.python_version(),
        "pyproj": versions["pyproj"],
        "proj": pyproj.proj_version_str,
        "mgrs": versions["mgrs"],
    }


def generate(output: Path, repo_root: Path) -> None:
    versions = check_versions()
    rng = random.Random(SEED)
    boundary = boundary_points(rng)

    builders: dict[str, Callable[[], dict]] = {
        "classification.json": lambda: classification_cases(boundary),
        "projection.json": lambda: projection_cases(boundary),
        "format-points.json": point_format_cases,
        "format-boxes.json": box_cases,
        "end-to-end.json": lambda: end_to_end_cases(boundary),
    }
    corpus = {name: build() for name, build in builders.items()}
    failures = check_plan_examples(corpus["end-to-end.json"]["cases"])
    if failures:
        raise RuntimeError("Plan example mismatch:\n" + "\n".join(failures))
    if SQUARE_STATS.disagreements:
        raise RuntimeError(
            f"Square ID tables disagree with mgrs: {SQUARE_STATS.disagreements[:5]}"
        )

    generator = Path(__file__).resolve()
    try:
        generator_path = generator.relative_to(repo_root).as_posix()
    except ValueError:
        generator_path = generator.as_posix()
    metadata = {
        "fixtureVersion": FIXTURE_VERSION,
        "generator": generator_path,
        "command": COMMAND,
        "seed": SEED,
        "versions": versions,
        "datum": "WGS84",
        "epsg": {
            "geographic": 4326,
            "utmNorth": "32600 + zone",
            "utmSouth": "32700 + zone",
            "upsNorth": 32661,
            "upsSouth": 32761,
        },
        "crsIdEncoding": "0 = UPS S, 1 = UPS N, 2 + (zone - 1) * 2 + (S ? 1 : 0) = UTM",
        "accPrecisions": list(ACC_PRECISIONS),
        "mgrsPrecisions": list(MGRS_PRECISIONS),
        "boxPrecisions": list(BOX_PRECISIONS),
        "boundaryOffsetMeters": MM,
        "semantics": {
            "classification": (
                "Exact on the input doubles, half-open, no snapping: N iff lat >= 0; UTM iff "
                "-80 <= lat < 84; zones own [west, east) after conforming lon to [-180, 180); "
                "bands own [south, north), X = [72, 84); Norway and Svalbard exceptions."
            ),
            "digits": (
                "floor of the oracle E/N (exact floor of the double, not of a rounded quotient); "
                "a value on a line belongs to the box east or north of it."
            ),
            "pointBand": (
                "UTM: from the point's latitude (end-to-end: the input latitude; format-points: "
                "pyproj's inverse latitude of the given E/N). UPS: from the easting "
                "(E < 2,000,000 is A/Y, otherwise B/Z)."
            ),
            "boxBand": (
                "UTM: from the latitude of the box centre unprojected in the box's CRS, "
                "clamped to [-80, 84) so boxes past the UTM/UPS seams stay C/X. UPS: from the "
                "lower-left easting."
            ),
            "squareId": (
                "mgrs package (GeoTrans) when it answers for the requested CRS; otherwise the "
                "generator's own copy of the GeoTrans letter tables (points on or past a "
                "region edge, and every UPS point that GeoTrans files under UTM). The two "
                "never disagree where both answer; generation fails if they do."
            ),
            "boundaryDistance": (
                "Per precision p: min over E and N of the distance from the oracle value to "
                "the nearest multiple of p. Filter end-to-end string checks on it (< 10 um)."
            ),
            "inverse": (
                "inverseLatitude/inverseLongitude are pyproj's inverse of the unrounded "
                "oracle E/N, longitude conformed to [-180, 180)."
            ),
        },
        "squareIdSource": {
            "mgrsPackage": SQUARE_STATS.package,
            "ownTablesOnly": SQUARE_STATS.own_only,
            "packageAnsweredForAnotherCrs": SQUARE_STATS.other_crs,
        },
        "mgrsPackageCrossCheck": {
            "description": (
                "mgrs.toMGRS(lat, lon, 5) compared with the corpus for every end-to-end case. "
                "zoneOrBand: GeoTrans keeps UTM for -80.0000100 <= lat <= 84.0000100 (an "
                "epsilon of 1.75e-7 rad, about 1.1 m), so lat = 84 exactly is UTM there and "
                "UPS here (plan §8.1). It also puts the UPS split by "
                "longitude where pyproj's easting is a rounding error below 2,000,000. "
                "square/digits1m: GeoTrans's own projection and rounding move values within "
                "about 1 mm of a line across it. The corpus follows the plan and pyproj."
            ),
            "checkedEndToEndCases": PACKAGE_CHECK.checked,
            "differences": PACKAGE_CHECK.by_kind,
        },
        "counts": {
            name.removesuffix(".json"): count_categories(value["cases"])
            for name, value in corpus.items()
        },
    }

    output.mkdir(parents=True, exist_ok=True)
    metadata_text = json.dumps(metadata, indent=2) + "\n"
    (output / "metadata.json").write_text(metadata_text, encoding="utf-8", newline="\n")
    for name, value in corpus.items():
        write_json(output / name, value)
        print(f"{name}: {len(value['cases'])} cases")


def main() -> None:
    repo_root = find_repo_root()
    default_output = (
        repo_root
        / "src"
        / "tests"
        / "vitest"
        / "fixtures"
        / "lgrs-earth"
        / FIXTURE_VERSION
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args()
    generate(args.output.resolve(), repo_root)


if __name__ == "__main__":
    main()
