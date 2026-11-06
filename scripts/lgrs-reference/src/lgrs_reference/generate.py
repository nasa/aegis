"""Generate the lgrs reference corpus used by the AEGIS TypeScript LGRS tests.

Run from the repository root with ``npm run lgrs:reference-corpus`` (an alias for
``uv run --project scripts/lgrs-reference generate``).
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import random
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from lgrs import database as lgrs_database
from lgrs.coords import Constraints, LatLonPoint, LpsPoint, LtmPoint
from lgrs.exceptions import CoordinateError
from lgrs.srs import wkt

REFERENCE_VERSION = "0.4.0"
REFERENCE_TAG = "v0.4.0"
REFERENCE_COMMIT = "1f11a12ac20e4f4aab89805535319252a2abd2eb"
REFERENCE_REPOSITORY = "https://github.com/rbeyer/lgrs"
STANDARD = 'USGS Techniques and Methods 11-E1 (2025), "M2025", default constraints'
COMMAND = "npm run lgrs:reference-corpus"
SEED = 4_002_026

PRECISIONS = (1, 10, 100, 1000, 25_000)
DISPLAY_PRECISION = 10
PROJECTION_GLOBAL_COUNT = 3500
PROJECTION_POLAR_COUNT = 800
PROJECTION_SEAM_COUNT = 2700
LABEL_SEEDED_COUNT = 3000
LABEL_NODE_COUNT = 1000
BEARING_SEEDED_PER_CATEGORY = 40

LUNAR_RADIUS = wkt.LUNAR_RADIUS
LTM_MAX_ABS_LATITUDE = wkt.LTM_UNEXTENDED_MAX_ABSOLUTE_LATITUDE
ZONE_WIDTH = 2 * wkt.LTM_ZONE_HALF_WIDTH
LPS_FALSE_ORIGIN = wkt.LPS_FALSE_EASTING
LPS_DOMAIN_RADIUS = (
    2
    * LUNAR_RADIUS
    * wkt.LPS_CENTRAL_SCALE_FACTOR
    * math.tan(math.radians((90 - LTM_MAX_ABS_LATITUDE) / 2))
)
MM = 0.001
# Ground angle subtended by 1 mm on the lunar sphere.
MM_DEG = math.degrees(MM / LUNAR_RADIUS)
# Oracle rejections closer than this to a region boundary are float noise.
AMBIGUOUS_BOUNDARY_DEG = 1e-9
# pyproj's spherical tmerc inverse snaps |lat| < ~1e-8 rad (about 2 cm) to 0.
EQUATOR_NOISE_METERS = 0.05
EQUATOR_DEAD_ZONE = "within pyproj's tmerc inverse dead zone at the equator"
# Oracle E/N this close to (but not on) a 1 m multiple make the label digits float noise.
LABEL_NOISE_METERS = 1e-7
# pyproj's tmerc forward takes acos() of a value near 1: error ~ k0 R ulp / |y|.
PROJ_ACOS_ERROR_SCALE_METERS = 4 * 2**-53 * wkt.LTM_CENTRAL_SCALE_FACTOR * LUNAR_RADIUS
PROJ_ACOS_MAX_ERROR_METERS = 0.03
PROJECTION_TOLERANCE_METERS = 1e-6
LOWER_LEFT_TOLERANCE = 1e-6

PLAN_EXAMPLES = (
    (0.0, 0.0, "23NFF-00-00"),
    (-0.0001, 0.0001, "23MFE-00Z99"),
    (45.0, 90.0, "34TGQS84N71"),
    (-45.0, -90.0, "12GDRG15L28"),
    (79.9, 10.0, "24XFGK62V59"),
    (8.0, 4.0, "24PAVD91S92"),
    (0.0, -180.0, "1NAAC72-00"),
    (80.0, 10.0, "ZCAB47B40"),
    (-80.0, 10.0, "BCZB47X59"),
    (-89.0, -133.0, "AZMB95D44"),
)

ORACLE_ERRORS = (CoordinateError, IndexError)


@dataclass(frozen=True)
class Crs:
    system: str
    zone: int | None
    hemisphere: str

    @property
    def crs_id(self) -> int:
        if self.system == "LPS":
            return 0 if self.hemisphere == "S" else 1
        return 2 + (self.zone - 1) * 2 + (1 if self.hemisphere == "S" else 0)


LPS_S = Crs("LPS", None, "S")
LPS_N = Crs("LPS", None, "N")


def ltm(zone: int, hemisphere: str) -> Crs:
    return Crs("LTM", zone, hemisphere)


def crs_of(point: LpsPoint | LtmPoint) -> Crs:
    if isinstance(point, LpsPoint):
        return Crs("LPS", None, point.hemisphere)
    return ltm(point.zone_number, point.hemisphere)


def make_point(
    crs: Crs, easting: float, northing: float, *, validate: bool
) -> LpsPoint | LtmPoint:
    if crs.system == "LPS":
        return LpsPoint(crs.hemisphere, easting, northing, validate=validate)
    return LtmPoint(crs.zone, crs.hemisphere, easting, northing, validate=validate)


def project_into(crs: Crs, latitude: float, longitude: float) -> tuple[float, float]:
    """Project with pyproj into `crs`, even outside its region."""
    anchor = make_point(crs, 250_000.0, 250_000.0, validate=False)
    constraints = Constraints(global_crs=anchor.crs_nominal)
    point = LatLonPoint(latitude, longitude, constraints=constraints)
    projected = point.to_lps_or_ltm(validate=False)
    return projected.easting, projected.northing


def round9(value: float) -> float:
    return round(value, 9)


def central_meridian(zone: int) -> float:
    return (zone - 1) * ZONE_WIDTH - 176


def oracle_inverse(crs: Crs, easting: float, northing: float) -> tuple[float, float]:
    latlon = make_point(crs, easting, northing, validate=False).to_latlon()
    return latlon.latitude, lgrs_database._conform_longitude(latlon.longitude)


def oracle_noise_reason(
    crs: Crs, easting: float, northing: float, latitude: float, longitude: float
) -> str | None:
    """Why the oracle's validity verdict for this point is float noise, if it is."""
    if crs.system == "LTM":
        false_northing = 0.0 if crs.hemisphere == "N" else wkt.LTM_S_FALSE_NORTHING
        if 0 < abs(northing - false_northing) < EQUATOR_NOISE_METERS:
            return EQUATOR_DEAD_ZONE
        west = central_meridian(crs.zone) - ZONE_WIDTH / 2
        lon_distance = min(
            abs((longitude - west + 180) % 360 - 180),
            abs((longitude - west - ZONE_WIDTH + 180) % 360 - 180),
        )
        if lon_distance < AMBIGUOUS_BOUNDARY_DEG:
            return f"{lon_distance:.1e} deg from a zone meridian"
    seam_distance = abs(abs(latitude) - LTM_MAX_ABS_LATITUDE)
    if seam_distance < AMBIGUOUS_BOUNDARY_DEG:
        return f"{seam_distance:.1e} deg from the 80 deg LPS/LTM seam"
    return None


def split_text(prefix: str, condensed: str, precision: int) -> str:
    if precision == 25_000:
        return prefix
    half = len(condensed) // 2
    return f"{condensed[:half]} {condensed[half:]}"


def box_fields(lgrs_box, precision: int, *, validate: bool | None) -> dict:
    acc_box = lgrs_box.to_acc(precision=precision, validate=validate)
    return {
        "lgrs": lgrs_box.string,
        "acc": acc_box.string,
        "prefix": acc_box.condensed_prefix,
        "condensed": acc_box.condensed,
    }


def point_label(point: LpsPoint | LtmPoint | LatLonPoint, precision: int) -> dict:
    """Oracle label of the point itself (raises on oracle rejection)."""
    return box_fields(point.to_lgrs(precision=precision), precision, validate=None)


def lower_left(easting: float, northing: float, precision: int) -> tuple[float, float]:
    return (
        math.floor(easting / precision) * precision,
        math.floor(northing / precision) * precision,
    )


class LowerLeftMismatch(RuntimeError):
    pass


def box_label(
    crs: Crs, easting: float, northing: float, precision: int, *, check: bool = True
) -> dict:
    """Oracle label of the box containing the point, computed at the box centre."""
    ll_e, ll_n = lower_left(easting, northing, precision)
    centre = make_point(crs, ll_e + precision / 2, ll_n + precision / 2, validate=False)
    lgrs_box = centre.to_lgrs(precision=precision, validate=False)
    fields = box_fields(lgrs_box, precision, validate=False)
    reference = lgrs_box.to_lps_or_ltm(validate=False)
    if check and (
        abs(reference.easting - ll_e) > LOWER_LEFT_TOLERANCE
        or abs(reference.northing - ll_n) > LOWER_LEFT_TOLERANCE
    ):
        raise LowerLeftMismatch(
            f"{crs} {easting} {northing} @{precision}: oracle reference corner "
            f"{reference.easting}, {reference.northing} != floor {ll_e}, {ll_n}"
        )
    return {
        **fields,
        "text": split_text(fields["prefix"], fields["condensed"], precision),
        "lowerLeft": [ll_e, ll_n],
    }


def point_is_valid(crs: Crs, easting: float, northing: float) -> bool:
    try:
        make_point(crs, easting, northing, validate=True)
    except CoordinateError as error:
        if "Validation conformed" not in str(error):
            return False
        # The oracle's reconstruction rejects its own inverse longitude of 180
        # because conforming it to -180 counts as a change; reclassify instead.
        latitude, longitude = oracle_inverse(crs, easting, northing)
        return crs_of(LatLonPoint(latitude, longitude).to_lps_or_ltm()) == crs
    return True


def ltm_forward_noise(
    crs: Crs, latitude: float, longitude: float, northing: float
) -> float:
    """Estimated error of pyproj's LTM northing, which uses acos() near the equator."""
    if crs.system != "LTM":
        return 0.0
    phi = math.radians(latitude)
    d_lambda = math.radians(longitude - central_meridian(crs.zone))
    y = math.atan2(math.tan(phi), math.cos(d_lambda))
    false_northing = 0.0 if crs.hemisphere == "N" else wkt.LTM_S_FALSE_NORTHING
    if y == 0:
        return 0.0 if northing == false_northing else PROJ_ACOS_MAX_ERROR_METERS
    return min(PROJ_ACOS_MAX_ERROR_METERS, PROJ_ACOS_ERROR_SCALE_METERS / abs(y))


def ltm_true_northing(crs: Crs, latitude: float, longitude: float) -> float:
    phi = math.radians(latitude)
    d_lambda = math.radians(longitude - central_meridian(crs.zone))
    y = math.atan2(math.tan(phi), math.cos(d_lambda))
    false_northing = 0.0 if crs.hemisphere == "N" else wkt.LTM_S_FALSE_NORTHING
    return wkt.LTM_CENTRAL_SCALE_FACTOR * LUNAR_RADIUS * y + false_northing


# * PROJECTION CASES. ──────────────────────────────────────────────────


def projection_case(latitude: float, longitude: float, category: str) -> dict:
    case = {"category": category, "latitude": latitude, "longitude": longitude}
    try:
        geo = LatLonPoint(latitude, longitude)
    except CoordinateError:
        return {**case, "expected": None}
    try:
        projected = geo.to_lps_or_ltm()
        label = point_label(geo, DISPLAY_PRECISION)
    except (ValueError, IndexError) as error:
        return {
            **case,
            "category": "rejected",
            "reason": f"{category}: oracle fails ({type(error).__name__}: {error})",
            "expected": None,
        }
    crs = crs_of(projected)
    easting = round9(projected.easting)
    northing = round9(projected.northing)
    inverse_lat, inverse_lon = oracle_inverse(crs, easting, northing)
    noise = ltm_forward_noise(crs, geo.latitude, geo.longitude, projected.northing)
    if noise > 0:
        true_northing = ltm_true_northing(crs, geo.latitude, geo.longitude)
        if math.floor(true_northing) != math.floor(projected.northing):
            case["category"] = "rejected"
            case["reason"] = (
                f"{category}: pyproj tmerc northing {projected.northing} is off by "
                f"{projected.northing - true_northing:.1e} m across a 1 m digit"
            )
    for name, value in (
        ("easting", projected.easting),
        ("northing", projected.northing),
    ):
        digit_distance = abs(value - round(value))
        if case["category"] != "rejected" and 0 < digit_distance < LABEL_NOISE_METERS:
            case["category"] = "rejected"
            case["reason"] = (
                f"{category}: oracle {name} {value!r} is {digit_distance:.1e} m from a 1 m digit"
            )
    extra = (
        {"toleranceMeters": 2 * noise}
        if 2 * noise > PROJECTION_TOLERANCE_METERS
        else {}
    )
    return {
        **case,
        "expected": {
            **extra,
            "crsId": crs.crs_id,
            "system": crs.system,
            "zone": crs.zone,
            "hemisphere": crs.hemisphere,
            "easting": easting,
            "northing": northing,
            "inverseLatitude": inverse_lat,
            "inverseLongitude": inverse_lon,
            "lgrs10": label["lgrs"],
            "acc10": label["acc"],
        },
    }


def latlon_boundary_case(latitude: float, longitude: float, category: str) -> dict:
    case = projection_case(latitude, longitude, category)
    if case["expected"] is not None and case["category"] != "rejected":
        geo = LatLonPoint(latitude, longitude)
        labels = {}
        for precision in PRECISIONS:
            try:
                label = point_label(geo, precision)
                labels[str(precision)] = {"lgrs": label["lgrs"], "acc": label["acc"]}
            except ORACLE_ERRORS:
                labels[str(precision)] = None
        case["labels"] = labels
    return case


def area_weighted_latitude(
    rng: random.Random, low: float = -90, high: float = 90
) -> float:
    lo = math.sin(math.radians(low))
    hi = math.sin(math.radians(high))
    return math.degrees(math.asin(lo + (hi - lo) * rng.random()))


def random_longitude(rng: random.Random) -> float:
    return -180 + 360 * rng.random()


def seam_offset(rng: random.Random) -> float:
    """Signed offset in degrees: exact (5%) or log-uniform in [1e-9, 1e-1]."""
    if rng.random() < 0.05:
        return 0.0
    return rng.choice((-1, 1)) * 10 ** rng.uniform(-9, -1)


def clamp_latitude(latitude: float) -> float:
    return max(-90.0, min(90.0, latitude))


def seam_points(rng: random.Random, count: int) -> list[tuple[float, float, str]]:
    kinds = (
        "seam-zone-meridian",
        "seam-band-parallel",
        "seam-equator",
        "seam-ltm-lps",
        "seam-antimeridian",
        "seam-pole",
    )
    points = []
    for index in range(count):
        kind = kinds[index % len(kinds)]
        if kind == "seam-zone-meridian":
            meridian = -180 + ZONE_WIDTH * rng.randrange(45)
            lat = area_weighted_latitude(
                rng, -LTM_MAX_ABS_LATITUDE, LTM_MAX_ABS_LATITUDE
            )
            lon = meridian + seam_offset(rng)
        elif kind == "seam-band-parallel":
            lat = 8 * rng.randrange(-9, 10) + seam_offset(rng)
            lon = random_longitude(rng)
        elif kind == "seam-equator":
            lat = seam_offset(rng)
            lon = random_longitude(rng)
        elif kind == "seam-ltm-lps":
            lat = rng.choice((-1, 1)) * LTM_MAX_ABS_LATITUDE + seam_offset(rng)
            lon = random_longitude(rng)
        elif kind == "seam-antimeridian":
            lat = area_weighted_latitude(rng)
            offset = abs(seam_offset(rng))
            lon = -180 + offset if rng.random() < 0.5 else 180 - offset
            lon = lgrs_database._conform_longitude(lon)
        else:
            lat = rng.choice((-1, 1)) * (90 - abs(seam_offset(rng)))
            lon = random_longitude(rng)
        points.append((clamp_latitude(lat), lon, kind))
    return points


def projection_cases() -> dict:
    rng = random.Random(SEED)
    points: list[tuple[float, float, str]] = []
    points += [
        (area_weighted_latitude(rng), random_longitude(rng), "seeded-global")
        for _ in range(PROJECTION_GLOBAL_COUNT)
    ]
    for index in range(PROJECTION_POLAR_COUNT):
        if index % 2:
            lat = area_weighted_latitude(rng, LTM_MAX_ABS_LATITUDE, 90)
        else:
            lat = area_weighted_latitude(rng, -90, -LTM_MAX_ABS_LATITUDE)
        points.append((lat, random_longitude(rng), "seeded-polar"))
    points += seam_points(rng, PROJECTION_SEAM_COUNT)
    points += [
        (90.000001, 0.0, "invalid-latitude"),
        (-90.5, 10.0, "invalid-latitude"),
        (123.0, -45.0, "invalid-latitude"),
        (0.0, 360.5, "invalid-longitude"),
        (10.0, -720.0, "invalid-longitude"),
    ]
    return {"cases": [projection_case(*point) for point in points]}


# * LABEL CASES. ───────────────────────────────────────────────────────


def projected_case(
    crs: Crs, easting: float, northing: float, precision: int, category: str
) -> dict:
    latitude, longitude = oracle_inverse(crs, easting, northing)
    case = {
        "category": category,
        "crsId": crs.crs_id,
        "easting": easting,
        "northing": northing,
        "latitude": latitude,
        "precision": precision,
    }
    noise = oracle_noise_reason(crs, easting, northing, latitude, longitude)
    if noise is not None:
        rejected = {
            **case,
            "category": "rejected",
            "reason": f"{category}: {noise}",
            "oracleValid": point_is_valid(crs, easting, northing),
            "expected": None,
            "expectedBox": None,
            "unvalidated": None,
        }
        if noise == EQUATOR_DEAD_ZONE:
            # pyproj's latitude (and so the band) is unreliable here, so set no constraint.
            return rejected
        unvalidated = make_point(crs, easting, northing, validate=False)
        try:
            label = box_fields(
                unvalidated.to_lgrs(precision=precision, validate=False),
                precision,
                validate=False,
            )
            rejected["unvalidated"] = {"lgrs": label["lgrs"], "acc": label["acc"]}
        except ORACLE_ERRORS:
            pass
        rejected["unvalidatedBox"] = box_label(
            crs, easting, northing, precision, check=False
        )
        return rejected
    if not point_is_valid(crs, easting, northing):
        return {**case, "expected": None, "expectedBox": None}

    if crs.system == "LPS":
        west_offset = LPS_FALSE_ORIGIN - easting
        if west_offset > 0 and west_offset % 25_000 == 0:
            # Eq. 105 yields digits "25000" here: ACC fails below 25 km and the
            # 25 km label names the box to the west.
            return {
                **case,
                "category": "rejected",
                "reason": f"{category}: LPS west-half easting on an exact 25 km multiple",
                "expected": None,
                "unvalidated": None,
                "expectedBox": box_label(crs, easting, northing, precision),
            }

    point = make_point(crs, easting, northing, validate=False)
    try:
        label = point_label(point, precision)
        case["expected"] = {
            "lgrs": label["lgrs"],
            "acc": label["acc"],
            "prefix": label["prefix"],
            "condensed": label["condensed"],
            "lowerLeft": list(lower_left(easting, northing, precision)),
        }
    except ORACLE_ERRORS as error:
        case["category"] = "rejected"
        case["reason"] = (
            f"{category}: oracle point label fails ({type(error).__name__})"
        )
        case["expected"] = None
        case["unvalidated"] = None
    case["expectedBox"] = box_label(crs, easting, northing, precision)
    return case


def label_cases() -> dict:
    rng = random.Random(SEED + 1)
    cases = []

    def sample_latlon(index: int) -> tuple[float, float]:
        if index % 5 == 0:
            south = index % 2 == 0
            low, high = (
                (-90, -LTM_MAX_ABS_LATITUDE) if south else (LTM_MAX_ABS_LATITUDE, 90)
            )
            return area_weighted_latitude(rng, low, high), random_longitude(rng)
        return area_weighted_latitude(rng), random_longitude(rng)

    for index in range(LABEL_SEEDED_COUNT):
        lat, lon = sample_latlon(index)
        projected = LatLonPoint(lat, lon).to_lps_or_ltm()
        precision = PRECISIONS[index % len(PRECISIONS)]
        cases.append(
            projected_case(
                crs_of(projected),
                round(projected.easting, 6),
                round(projected.northing, 6),
                precision,
                "seeded",
            )
        )
    # Grid nodes: exact multiples of the precision, as the dynamic grid labels them.
    for index in range(LABEL_NODE_COUNT):
        lat, lon = sample_latlon(index)
        projected = LatLonPoint(lat, lon).to_lps_or_ltm()
        precision = PRECISIONS[index % len(PRECISIONS)]
        node_e, node_n = lower_left(projected.easting, projected.northing, precision)
        cases.append(
            projected_case(crs_of(projected), node_e, node_n, precision, "grid-node")
        )
    invalid = [
        (ltm(23, "N"), 100_000.0, 1_000_000.0, "invalid-ltm-outside-zone"),
        (ltm(23, "N"), 250_000.0, -10.0, "invalid-ltm-wrong-hemisphere"),
        (ltm(23, "S"), 250_000.0, 2_500_010.0, "invalid-ltm-wrong-hemisphere"),
        (ltm(7, "N"), 250_000.0, 2_450_000.0, "invalid-ltm-beyond-80"),
        (ltm(40, "S"), 250_000.0, 50_000.0, "invalid-ltm-beyond-80"),
        (LPS_S, 900_000.0, 500_000.0, "invalid-lps-outside-cap"),
        (LPS_N, 500_000.0, 100_000.0, "invalid-lps-outside-cap"),
    ]
    for crs, easting, northing, category in invalid:
        for precision in PRECISIONS:
            cases.append(projected_case(crs, easting, northing, precision, category))
    return {"cases": cases}


# * BOUNDARY CASES. ────────────────────────────────────────────────────


def offsets_mm(value: float) -> Iterable[tuple[float, str]]:
    return ((value - MM, "below"), (value, "exact"), (value + MM, "above"))


def lon_offset_deg(latitude: float) -> float:
    return MM_DEG / max(math.cos(math.radians(latitude)), 1e-6)


def latlon_boundary_points() -> list[tuple[float, float, str]]:
    points: list[tuple[float, float, str]] = []
    for lat, lon, _ in PLAN_EXAMPLES:
        points.append((lat, lon, "plan-example"))
    points += [
        (-90.0, 0.0, "south-pole"),
        (-89.0, -133.0, "surf-nav-regression"),
        (-85.0, 2.0, "upstream-usage-example"),
        (-80.0, 0.0, "south-lps-boundary-central-meridian"),
        (-80.0, -179.999, "south-lps-boundary-west-dateline"),
        (-80.0, 179.999, "south-lps-boundary-east-dateline"),
        (-80.000001, 45.0, "south-lps-boundary-poleward"),
        (-85.0, -90.0, "west-cardinal-meridian"),
        (-85.0, 90.0, "east-cardinal-meridian"),
        (-85.0, 180.0, "antimeridian"),
    ]
    for k in range(45):
        meridian = -180.0 + ZONE_WIDTH * k
        for lat in (0.0, 2.5, -33.3, 61.0, -79.9):
            delta = lon_offset_deg(lat)
            for lon, side in (
                (meridian - delta, "below"),
                (meridian, "exact"),
                (meridian + delta, "above"),
            ):
                points.append((lat, lon, f"zone-meridian-{side}"))
    for k in range(-10, 11):
        parallel = 8.0 * k
        for lon in (1.5, -100.25, 177.0, -4.0):
            for lat, side in (
                (parallel - MM_DEG, "below"),
                (parallel, "exact"),
                (parallel + MM_DEG, "above"),
            ):
                points.append((lat, lon, f"band-parallel-{side}"))
    for lon in (-180.0, -176.0, -4.0, 0.0, 4.0, 90.0, 179.0):
        for lat, side in ((-MM_DEG, "below"), (0.0, "exact"), (MM_DEG, "above")):
            points.append((lat, lon, f"equator-{side}"))
    for sign in (-1, 1):
        for lon in (-180.0, -90.0, 0.0, 10.0, 45.0, 90.0, 179.999999999):
            for lat, side in (
                (sign * (80 - MM_DEG), "ltm-side"),
                (sign * 80.0, "exact"),
                (sign * (80 + MM_DEG), "lps-side"),
            ):
                points.append((lat, lon, f"ltm-lps-seam-{side}"))
    for lat in (0.0, 40.0, -40.0, 79.9, -85.0, 85.0):
        delta = lon_offset_deg(lat)
        points += [
            (lat, -180.0, "antimeridian-exact"),
            (lat, 180.0, "antimeridian-exact"),
            (lat, -180.0 + delta, "antimeridian-above"),
            (lat, 180.0 - delta, "antimeridian-below"),
            (lat, 179.99999999999997, "antimeridian-below-ulp"),
        ]
    for sign in (-1, 1):
        for lon in (-180.0, -90.0, 0.0, 45.0, 90.0, 135.5):
            points.append((sign * 90.0, lon, "pole-exact"))
            points.append((sign * (90 - MM_DEG), lon, "pole-1mm"))
    points += [
        (45.0, 182.0, "longitude-conformation"),
        (0.0, -181.0, "longitude-conformation"),
        (10.0, 360.0, "longitude-conformation"),
        (10.0, -360.0, "longitude-conformation"),
        (-30.0, 200.0, "longitude-conformation"),
        (-30.0, -200.0, "longitude-conformation"),
        (0.5, 359.999, "longitude-conformation"),
        (-85.0, 270.0, "longitude-conformation"),
        (85.0, -300.0, "longitude-conformation"),
        (0.0, 361.0, "invalid-longitude"),
        (0.0, -400.0, "invalid-longitude"),
        (90.0000001, 0.0, "invalid-latitude"),
        (-91.0, 0.0, "invalid-latitude"),
    ]
    for zone in (1, 2, 3, 22, 23, 24, 45):
        west = central_meridian(zone) - ZONE_WIDTH / 2
        east = west + ZONE_WIDTH
        for lat in (MM_DEG, 0.0005, -0.0005, -MM_DEG):
            delta = lon_offset_deg(lat)
            points.append((lat, west + delta, "easting-area-a"))
            points.append((lat, east - delta, "easting-area-k"))
    return points


def projected_boundary_cases() -> list[dict]:
    cases: list[dict] = []

    def add(
        crs: Crs, easting: float, northing: float, category: str, side: str
    ) -> None:
        precisions = PRECISIONS if side == "exact" else (1, 25_000)
        for precision in precisions:
            cases.append(
                projected_case(crs, easting, northing, precision, f"{category}-{side}")
            )

    # Readable LPS cases from the 0.3.0 corpus, mirrored for the north cap.
    for crs in (LPS_S, LPS_N):
        name = crs.hemisphere.lower()
        origin = LPS_FALSE_ORIGIN
        for easting, side in offsets_mm(origin):
            add(crs, easting, origin, f"lps-{name}-false-easting", side)
        for northing, side in offsets_mm(origin):
            add(crs, origin, northing, f"lps-{name}-false-northing", side)
        for boundary in range(200_000, 800_001, 25_000):
            if boundary == origin:
                continue
            for value, side in offsets_mm(float(boundary)):
                add(crs, value, origin, f"lps-{name}-easting-area", side)
                add(crs, origin, value, f"lps-{name}-northing-area", side)
        edge = origin + LPS_DOMAIN_RADIUS
        for easting, side in (
            (edge - MM, "inside"),
            (edge, "exact"),
            (edge + MM, "outside"),
        ):
            add(crs, easting, origin, f"lps-{name}-domain-edge", side)
        for easting, side in (
            (origin - LPS_DOMAIN_RADIUS - MM, "outside"),
            (origin - LPS_DOMAIN_RADIUS + MM, "inside"),
        ):
            add(crs, easting, origin, f"lps-{name}-domain-edge-west", side)

    # Every 25 km boundary for zones in each northing letter set, both hemispheres.
    for zone in (22, 23, 24):
        for hemi in ("N", "S"):
            crs = ltm(zone, hemi)
            label = f"ltm-set{(zone - 1) % 3}-{hemi.lower()}"
            n_values = (
                range(0, 2_425_001, 25_000)
                if hemi == "N"
                else range(75_000, 2_500_001, 25_000)
            )
            for boundary in n_values:
                for value, side in offsets_mm(float(boundary)):
                    add(crs, 262_345.678, value, f"{label}-northing-area", side)
            sample_n = (
                (12_345.678, 1_007_654.321)
                if hemi == "N"
                else (2_487_654.321, 1_492_345.678)
            )
            for northing in sample_n:
                for boundary in range(125_000, 375_001, 25_000):
                    for value, side in offsets_mm(float(boundary)):
                        add(crs, value, northing, f"{label}-easting-area", side)

    # Hemisphere and zone edges in projected space.
    for crs, equator in ((ltm(23, "N"), 0.0), (ltm(23, "S"), wkt.LTM_S_FALSE_NORTHING)):
        name = f"ltm-{crs.hemisphere.lower()}-equator"
        for value, side in offsets_mm(equator):
            add(crs, 250_000.0, value, name, side)
        for value, side in (
            (equator - 0.1, "below-10cm"),
            (equator + 0.1, "above-10cm"),
        ):
            add(crs, 250_000.0, value, name, side)
    for zone in (1, 23, 45):
        for hemi, northing in (("N", 1_234.5), ("S", 2_498_765.5)):
            crs = ltm(zone, hemi)
            lat_inv, _ = oracle_inverse(crs, 250_000.0, northing)
            west = central_meridian(zone) - ZONE_WIDTH / 2
            for lon in (west, west + ZONE_WIDTH):
                edge_e, edge_n = project_into(crs, lat_inv, lon)
                for easting, side in offsets_mm(edge_e):
                    add(crs, easting, edge_n, "ltm-zone-edge", side)
    return cases


def boundary_cases() -> dict:
    return {
        "latLonCases": [
            latlon_boundary_case(*point) for point in latlon_boundary_points()
        ],
        "projectedCases": projected_boundary_cases(),
    }


# * BEARING CASES. ─────────────────────────────────────────────────────

BEARING_FORMULA = (
    "Both points are projected into the ORIGIN's LGRS CRS (lgrs/pyproj, default "
    "constraints). dE = destinationEN[0] - originEN[0], dN = destinationEN[1] - "
    "originEN[1]. expectedBearing = degrees(atan2(dE, dN)) normalised to [0, 360) "
    "(grid north = +N, clockwise toward +E). expectedRange = hypot(dE, dN) in metres."
)


def bearing_case(
    origin: tuple[float, float], destination: tuple[float, float], category: str
) -> dict:
    origin_point = LatLonPoint(*origin).to_lps_or_ltm()
    crs = crs_of(origin_point)
    origin_en = (origin_point.easting, origin_point.northing)
    destination_en = project_into(crs, *destination)
    d_e = destination_en[0] - origin_en[0]
    d_n = destination_en[1] - origin_en[1]
    bearing = math.degrees(math.atan2(d_e, d_n)) % 360
    if bearing >= 360:
        bearing = 0.0
    return {
        "category": category,
        "origin": {"lat": origin[0], "lng": origin[1]},
        "destination": {"lat": destination[0], "lng": destination[1]},
        "originCrsId": crs.crs_id,
        "originEN": [round9(origin_en[0]), round9(origin_en[1])],
        "destinationEN": [round9(destination_en[0]), round9(destination_en[1])],
        "expectedBearing": bearing,
        "expectedRange": math.hypot(d_e, d_n),
    }


def offset_point(
    rng: random.Random, lat: float, lon: float, max_km: float
) -> tuple[float, float]:
    distance = 10 ** rng.uniform(-1, math.log10(max_km)) * 1000
    azimuth = rng.random() * math.tau
    d_lat = math.degrees(distance * math.cos(azimuth) / LUNAR_RADIUS)
    d_lon = math.degrees(distance * math.sin(azimuth) / LUNAR_RADIUS) / max(
        math.cos(math.radians(lat)), 1e-3
    )
    return clamp_latitude(lat + d_lat), lgrs_database._conform_longitude(lon + d_lon)


def bearing_cases() -> dict:
    rng = random.Random(SEED + 2)
    pairs: list[tuple[tuple[float, float], tuple[float, float], str]] = [
        ((-89.0, -133.0), (-89.001, -132.9), "lps-s"),
        ((-89.0, -133.0), (-88.5, 47.0), "lps-s"),
        ((-89.5, 0.0), (-89.5, 180.0), "lps-s-across-pole"),
        ((-85.0, 2.0), (-85.2, 2.5), "lps-s"),
        ((-85.0, 90.0), (-85.0, -90.0), "lps-s-across-pole"),
        ((89.5, 0.0), (89.5, 180.0), "lps-n-across-pole"),
        ((85.0, -45.0), (85.1, -44.0), "lps-n"),
        ((0.0, 0.0), (0.01, 0.0), "ltm-within-zone"),
        ((0.0, 0.0), (0.0, 0.01), "ltm-within-zone"),
        ((45.0, 90.0), (45.2, 90.3), "ltm-within-zone"),
        ((10.0, 3.9), (10.0, 4.2), "ltm-across-zone-meridian"),
        ((-10.0, -180.0), (-10.0, 179.8), "ltm-across-zone-meridian"),
        ((0.1, 10.0), (-0.1, 10.1), "ltm-across-equator"),
        ((-0.1, 10.0), (0.1, 10.1), "ltm-across-equator"),
        ((79.9, 10.0), (80.1, 10.2), "ltm-across-80"),
        ((80.1, 10.0), (79.9, 10.2), "lps-across-80"),
        ((-79.9, -60.0), (-80.1, -60.2), "ltm-across-80"),
        ((-80.1, -60.0), (-79.9, -60.2), "lps-across-80"),
    ]
    for _ in range(BEARING_SEEDED_PER_CATEGORY):
        lat = area_weighted_latitude(rng, -90, -80.5)
        origin = (lat, random_longitude(rng))
        pairs.append((origin, offset_point(rng, *origin, 30), "lps-s"))
    for _ in range(BEARING_SEEDED_PER_CATEGORY):
        lat = area_weighted_latitude(rng, 80.5, 90)
        origin = (lat, random_longitude(rng))
        pairs.append((origin, offset_point(rng, *origin, 30), "lps-n"))
    for _ in range(BEARING_SEEDED_PER_CATEGORY):
        zone = rng.randrange(1, 46)
        lat = area_weighted_latitude(rng, -78, 78)
        lon = central_meridian(zone) + rng.uniform(-3, 3)
        pairs.append(((lat, lon), offset_point(rng, lat, lon, 20), "ltm-within-zone"))
    for _ in range(BEARING_SEEDED_PER_CATEGORY):
        meridian = -180 + ZONE_WIDTH * rng.randrange(45)
        lat = area_weighted_latitude(rng, -78, 78)
        scale = 1 / math.cos(math.radians(lat))
        origin = (
            lat,
            lgrs_database._conform_longitude(meridian - rng.uniform(0.01, 0.3) * scale),
        )
        destination = (
            lat + rng.uniform(-0.3, 0.3),
            lgrs_database._conform_longitude(meridian + rng.uniform(0.01, 0.3) * scale),
        )
        if rng.random() < 0.5:
            origin, destination = destination, origin
        pairs.append((origin, destination, "ltm-across-zone-meridian"))
    for _ in range(BEARING_SEEDED_PER_CATEGORY):
        lon = random_longitude(rng)
        origin = (rng.uniform(0.001, 0.5), lon)
        destination = (
            -rng.uniform(0.001, 0.5),
            lgrs_database._conform_longitude(lon + rng.uniform(-0.3, 0.3)),
        )
        if rng.random() < 0.5:
            origin, destination = destination, origin
        pairs.append((origin, destination, "ltm-across-equator"))
    for _ in range(BEARING_SEEDED_PER_CATEGORY):
        sign = rng.choice((-1, 1))
        lon = random_longitude(rng)
        origin = (sign * (80 - rng.uniform(0.001, 0.5)), lon)
        destination = (
            sign * (80 + rng.uniform(0.001, 0.5)),
            lgrs_database._conform_longitude(lon + rng.uniform(-1, 1)),
        )
        if rng.random() < 0.5:
            pairs.append((origin, destination, "ltm-across-80"))
        else:
            pairs.append((destination, origin, "lps-across-80"))
    return {
        "formula": BEARING_FORMULA,
        "cases": [
            bearing_case(origin, destination, category)
            for origin, destination, category in pairs
        ],
    }


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


def check_plan_examples(boundaries: dict) -> list[str]:
    expected = {(lat, lon): acc for lat, lon, acc in PLAN_EXAMPLES}
    failures = []
    for case in boundaries["latLonCases"]:
        if case["category"] != "plan-example":
            continue
        want = expected[(case["latitude"], case["longitude"])]
        got = case["expected"]["acc10"] if case["expected"] else None
        if got != want:
            failures.append(f"{case['latitude']}, {case['longitude']}: {got} != {want}")
    return failures


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


def generate(output: Path, repo_root: Path) -> None:
    installed_version = importlib.metadata.version("lgrs")
    if installed_version != REFERENCE_VERSION:
        raise RuntimeError(
            f"Expected lgrs {REFERENCE_VERSION}, found {installed_version}"
        )

    builders: dict[str, Callable[[], dict]] = {
        "projection.json": projection_cases,
        "labels.json": label_cases,
        "boundaries.json": boundary_cases,
        "bearings.json": bearing_cases,
    }
    corpus = {name: build() for name, build in builders.items()}
    plan_failures = check_plan_examples(corpus["boundaries.json"])
    if plan_failures:
        raise RuntimeError("Plan example mismatch:\n" + "\n".join(plan_failures))

    generator = Path(__file__).resolve()
    try:
        generator_path = generator.relative_to(repo_root).as_posix()
    except ValueError:
        generator_path = generator.as_posix()
    boundaries = corpus["boundaries.json"]
    metadata = {
        "package": "lgrs",
        "version": REFERENCE_VERSION,
        "repository": REFERENCE_REPOSITORY,
        "tag": REFERENCE_TAG,
        "commit": REFERENCE_COMMIT,
        "standard": STANDARD,
        "generator": generator_path,
        "command": COMMAND,
        "seed": SEED,
        "precisions": list(PRECISIONS),
        "displayPrecisionMeters": DISPLAY_PRECISION,
        "crsIdEncoding": "0 = LPS S, 1 = LPS N, 2 + (zone - 1) * 2 + (S ? 1 : 0) = LTM",
        "lunarRadiusMeters": LUNAR_RADIUS,
        "lpsDomainRadiusMeters": LPS_DOMAIN_RADIUS,
        "boundaryOffsetMeters": MM,
        "ambiguousBoundaryDegrees": AMBIGUOUS_BOUNDARY_DEG,
        "semantics": {
            "pointLabel": (
                "Oracle to_lgrs/to_acc of the point itself; the LTM latitude band "
                "comes from the point's latitude. Null when the point is outside "
                "its CRS region."
            ),
            "boxLabel": (
                "Null when the point is outside its CRS region; otherwise the label "
                "of the point floor(c / p) * p + p / 2, without validating the box."
            ),
            "rejected": (
                "Oracle verdict is not authoritative (see each case's reason): "
                "float noise at a region boundary, pyproj precision loss near the "
                "equator, or an oracle failure. Tests accept null or `unvalidated`."
            ),
            "toleranceMeters": (
                "pyproj's tmerc northing loses precision near the equator; cases "
                "there carry a wider projection tolerance."
            ),
            "inverse": (
                "inverseLatitude/inverseLongitude are pyproj's inverse of the "
                "rounded E/N, longitude conformed to [-180, 180)."
            ),
        },
        "counts": {
            "projection": count_categories(corpus["projection.json"]["cases"]),
            "labels": count_categories(corpus["labels.json"]["cases"]),
            "boundariesLatLon": count_categories(boundaries["latLonCases"]),
            "boundariesProjected": count_categories(boundaries["projectedCases"]),
            "bearings": count_categories(corpus["bearings.json"]["cases"]),
        },
    }

    output.mkdir(parents=True, exist_ok=True)
    metadata_text = json.dumps(metadata, indent=2) + "\n"
    (output / "metadata.json").write_text(metadata_text, encoding="utf-8", newline="\n")
    for name, value in corpus.items():
        write_json(output / name, value)
    for key, counts in metadata["counts"].items():
        print(f"{key}: {sum(counts.values())} cases")


def main() -> None:
    repo_root = find_repo_root()
    default_output = (
        repo_root / "src" / "tests" / "vitest" / "fixtures" / "lgrs" / REFERENCE_VERSION
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args()
    generate(args.output.resolve(), repo_root)


if __name__ == "__main__":
    main()
