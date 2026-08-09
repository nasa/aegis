#!/usr/bin/env python3
"""Generate deterministic south-LPS fixtures for the browser LGRS port."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import math
import random
from pathlib import Path

from lgrs.coords import LatLonPoint, LpsPoint

ORACLE_VERSION = "0.3.0"
ORACLE_TAG = "v0.3.0"
ORACLE_COMMIT = "6ba953e09e5dde9d379df5b2c1a91b7b958fb851"
ORACLE_REPOSITORY = "https://github.com/rbeyer/lgrs"
STANDARD = "USGS Techniques and Methods 11-E1 (2025), mark 7.2 reference code"
SEED = 9382026
RANDOM_CASE_COUNT = 3000
PROJECTION_RANDOM_CASE_COUNT = 3000
LUNAR_RADIUS = 1_737_400.0
LPS_SCALE = 0.994
FALSE_ORIGIN = 500_000.0
MIN_LATITUDE = -80.0
DOMAIN_RADIUS = 2 * LUNAR_RADIUS * LPS_SCALE * math.tan(math.radians(5))
DOMAIN_TOLERANCE_METERS = 1e-6
PRECISIONS = (10, 100, 1000)
DISPLAY_PRECISION = 10


def round_coordinate(value: float) -> float:
    return round(value, 6)


def round_projection_coordinate(value: float) -> float:
    return round(value, 9)


def is_supported(easting: float, northing: float) -> bool:
    return (
        math.hypot(easting - FALSE_ORIGIN, northing - FALSE_ORIGIN)
        <= DOMAIN_RADIUS + DOMAIN_TOLERANCE_METERS
    )


def oracle_label(easting: float, northing: float, precision: int) -> dict | None:
    if not is_supported(easting, northing):
        return None

    lower_easting = math.floor(easting / precision) * precision
    lower_northing = math.floor(northing / precision) * precision
    point = LpsPoint(
        "S",
        lower_easting + precision / 2,
        lower_northing + precision / 2,
        validate=False,
    )
    lgrs_box = point.to_lgrs(precision=precision, validate=False)
    acc_box = lgrs_box.to_acc(precision=precision, validate=False)
    reference = lgrs_box.to_lps(validate=False)
    half = len(acc_box.condensed) // 2
    return {
        "lgrs": lgrs_box.string,
        "acc": acc_box.string,
        "condensed": acc_box.condensed,
        "text": f"{acc_box.condensed[:half]} {acc_box.condensed[half:]}",
        "lowerLeft": [
            round_coordinate(reference.easting),
            round_coordinate(reference.northing),
        ],
    }


def point_case(easting: float, northing: float, precision: int, category: str) -> dict:
    serialized_easting = round_coordinate(easting)
    serialized_northing = round_coordinate(northing)
    return {
        "category": category,
        "easting": serialized_easting,
        "northing": serialized_northing,
        "precision": precision,
        "supported": is_supported(serialized_easting, serialized_northing),
        "expected": oracle_label(serialized_easting, serialized_northing, precision),
    }


def readable_cases() -> list[dict]:
    points: list[tuple[float, float, str]] = [
        (500_000, 500_000, "pole"),
        (499_999.999, 500_000, "false-easting-below"),
        (500_000.001, 500_000, "false-easting-above"),
        (500_000, 499_999.999, "false-northing-below"),
        (500_000, 500_000.001, "false-northing-above"),
    ]
    for boundary in (425_000, 450_000, 475_000, 525_000, 550_000, 575_000):
        points.extend(
            [
                (boundary - 0.001, 500_000, "easting-area-below"),
                (boundary, 500_000, "easting-area-exact"),
                (boundary + 0.001, 500_000, "easting-area-above"),
                (500_000, boundary - 0.001, "northing-area-below"),
                (500_000, boundary, "northing-area-exact"),
                (500_000, boundary + 0.001, "northing-area-above"),
            ]
        )
    points.extend(
        [
            (FALSE_ORIGIN + DOMAIN_RADIUS - 0.001, FALSE_ORIGIN, "domain-inside"),
            (FALSE_ORIGIN + DOMAIN_RADIUS, FALSE_ORIGIN, "domain-edge"),
            (FALSE_ORIGIN + DOMAIN_RADIUS + 0.001, FALSE_ORIGIN, "domain-outside"),
        ]
    )
    return [
        point_case(easting, northing, precision, category)
        for easting, northing, category in points
        for precision in PRECISIONS
    ]


def seeded_cases() -> list[dict]:
    rng = random.Random(SEED)
    cases = []
    for index in range(RANDOM_CASE_COUNT):
        angle = rng.random() * math.tau
        radius = math.sqrt(rng.random()) * (DOMAIN_RADIUS - 1)
        easting = FALSE_ORIGIN + radius * math.cos(angle)
        northing = FALSE_ORIGIN + radius * math.sin(angle)
        precision = PRECISIONS[index % len(PRECISIONS)]
        cases.append(point_case(easting, northing, precision, "seeded"))
    return cases


def projection_case(latitude: float, longitude: float, category: str) -> dict:
    latitude = round_coordinate(latitude)
    longitude = round_coordinate(longitude)
    point = LatLonPoint(latitude=latitude, longitude=longitude)
    lps = point.to_lps()
    lgrs_box = point.to_lgrs(precision=DISPLAY_PRECISION)
    acc_box = lgrs_box.to_acc(precision=DISPLAY_PRECISION)
    half = len(acc_box.condensed) // 2
    return {
        "category": category,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "expected": {
            "easting": round_projection_coordinate(lps.easting),
            "northing": round_projection_coordinate(lps.northing),
            "lgrs": lgrs_box.string,
            "acc": acc_box.string,
            "text": f"{acc_box.condensed[:half]} {acc_box.condensed[half:]}",
        },
    }


def projection_cases() -> dict:
    readable = [
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
    rng = random.Random(SEED + 1)
    seeded = [
        (
            -90.0 + rng.random() * (MIN_LATITUDE + 90.0),
            -180.0 + rng.random() * 360.0,
            "seeded",
        )
        for _ in range(PROJECTION_RANDOM_CASE_COUNT)
    ]
    return {
        "readableCases": [projection_case(*case) for case in readable],
        "seededCases": [projection_case(*case) for case in seeded],
    }


def align_first(value: float, spacing: int) -> int:
    return math.ceil(value / spacing) * spacing


def standard_precision(spacing: int) -> int:
    return next(
        precision for precision in (1000, 100, 10, 1) if spacing % precision == 0
    )


def viewport_plan(case: dict) -> dict:
    min_e, min_n, max_e, max_n = case["extent"]
    width = max(
        0,
        min(max_e, FALSE_ORIGIN + DOMAIN_RADIUS)
        - max(min_e, FALSE_ORIGIN - DOMAIN_RADIUS),
    )
    height = max(
        0,
        min(max_n, FALSE_ORIGIN + DOMAIN_RADIUS)
        - max(min_n, FALSE_ORIGIN - DOMAIN_RADIUS),
    )
    visible_cells = max(1, math.ceil(width / 10)) * max(1, math.ceil(height / 10))
    spacing_mode = case["gridSpacingMode"]
    line_spacing = (
        max(10, math.ceil(math.sqrt(visible_cells / 100)) * 10)
        if spacing_mode == "auto"
        else spacing_mode
    )
    label_mode = case["gridLabelInterval"]
    labels_visible = case["labelsVisible"]
    label_spacing = line_spacing
    if spacing_mode == "auto":
        target = math.ceil(math.sqrt(visible_cells / 25)) * 10
        label_spacing = math.ceil(target / line_spacing) * line_spacing
    elif label_mode == "auto":
        labels_visible = (
            labels_visible and line_spacing / LPS_SCALE / case["mapResolution"] >= 60
        )
    else:
        label_spacing = max(
            line_spacing, math.ceil(label_mode / line_spacing) * line_spacing
        )

    lines = []
    radius_squared = DOMAIN_RADIUS**2
    for easting in range(
        align_first(min_e, line_spacing), math.floor(max_e) + 1, line_spacing
    ):
        remaining = radius_squared - (easting - FALSE_ORIGIN) ** 2
        if remaining < 0:
            continue
        half_length = math.sqrt(remaining)
        start = max(min_n, FALSE_ORIGIN - half_length)
        end = min(max_n, FALSE_ORIGIN + half_length)
        if start <= end:
            lines.append(
                {
                    "axis": "easting",
                    "value": easting,
                    "start": [easting, round_coordinate(start)],
                    "end": [easting, round_coordinate(end)],
                }
            )
    for northing in range(
        align_first(min_n, line_spacing), math.floor(max_n) + 1, line_spacing
    ):
        remaining = radius_squared - (northing - FALSE_ORIGIN) ** 2
        if remaining < 0:
            continue
        half_length = math.sqrt(remaining)
        start = max(min_e, FALSE_ORIGIN - half_length)
        end = min(max_e, FALSE_ORIGIN + half_length)
        if start <= end:
            lines.append(
                {
                    "axis": "northing",
                    "value": northing,
                    "start": [round_coordinate(start), northing],
                    "end": [round_coordinate(end), northing],
                }
            )

    labels = []
    if labels_visible:
        precision = standard_precision(label_spacing)
        for northing in range(
            align_first(min_n, label_spacing), math.floor(max_n) + 1, label_spacing
        ):
            for easting in range(
                align_first(min_e, label_spacing), math.floor(max_e) + 1, label_spacing
            ):
                expected = oracle_label(easting, northing, precision)
                if expected:
                    labels.append(
                        {"coordinate": [easting, northing], "expected": expected}
                    )

    return {
        **case,
        "expected": {
            "lineSpacing": line_spacing,
            "labelSpacing": label_spacing,
            "lines": lines,
            "labels": labels,
        },
    }


def viewport_cases() -> list[dict]:
    cases = [
        {
            "name": "auto-2km",
            "extent": [499_000, 499_000, 501_000, 501_000],
            "gridSpacingMode": "auto",
            "gridLabelInterval": "auto",
            "mapResolution": 1,
            "labelsVisible": True,
        },
        {
            "name": "auto-10km",
            "extent": [495_000, 495_000, 505_000, 505_000],
            "gridSpacingMode": "auto",
            "gridLabelInterval": "auto",
            "mapResolution": 10,
            "labelsVisible": True,
        },
        {
            "name": "fixed-10m-auto-labels-hidden",
            "extent": [499_900, 499_900, 500_100, 500_100],
            "gridSpacingMode": 10,
            "gridLabelInterval": "auto",
            "mapResolution": 1,
            "labelsVisible": True,
        },
        {
            "name": "fixed-10m-100m-labels",
            "extent": [499_500, 499_500, 500_500, 500_500],
            "gridSpacingMode": 10,
            "gridLabelInterval": 100,
            "mapResolution": 1,
            "labelsVisible": True,
        },
        {
            "name": "fixed-100m-1km-labels",
            "extent": [495_000, 495_000, 505_000, 505_000],
            "gridSpacingMode": 100,
            "gridLabelInterval": 1000,
            "mapResolution": 5,
            "labelsVisible": True,
        },
        {
            "name": "domain-edge-clipping",
            "extent": [
                round_coordinate(FALSE_ORIGIN + DOMAIN_RADIUS - 2_000),
                498_000,
                round_coordinate(FALSE_ORIGIN + DOMAIN_RADIUS + 2_000),
                502_000,
            ],
            "gridSpacingMode": 1000,
            "gridLabelInterval": 1000,
            "mapResolution": 10,
            "labelsVisible": True,
        },
    ]
    return [viewport_plan(case) for case in cases]


def write_json(path: Path, value: object) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(value, indent=2, sort_keys=True) + "\n")


def generate(output: Path) -> None:
    installed_version = importlib.metadata.version("lgrs")
    if installed_version != ORACLE_VERSION:
        raise RuntimeError(f"Expected lgrs {ORACLE_VERSION}, found {installed_version}")

    output.mkdir(parents=True, exist_ok=True)
    generator_path = Path(__file__).resolve()
    metadata = {
        "package": "lgrs",
        "version": ORACLE_VERSION,
        "repository": ORACLE_REPOSITORY,
        "tag": ORACLE_TAG,
        "commit": ORACLE_COMMIT,
        "standard": STANDARD,
        "generator": str(generator_path.relative_to(generator_path.parents[3])).replace(
            "\\", "/"
        ),
        "command": "pixi run lgrs-oracle",
        "seed": SEED,
        "seededCaseCount": RANDOM_CASE_COUNT,
        "projectionCaseCount": PROJECTION_RANDOM_CASE_COUNT,
        "projectionDisplayPrecisionMeters": DISPLAY_PRECISION,
        "projectionSource": "lgrs.coords.LatLonPoint(...).to_lps()",
        "southLpsMinimumLatitude": MIN_LATITUDE,
        "southLpsDomainRadiusMeters": DOMAIN_RADIUS,
        "southLpsDomainToleranceMeters": DOMAIN_TOLERANCE_METERS,
    }
    cases = {"readableCases": readable_cases(), "seededCases": seeded_cases()}
    files = {
        "metadata.json": metadata,
        "south-lps-cases.json": cases,
        "south-lps-projection-cases.json": projection_cases(),
        "south-lps-viewports.json": {"viewports": viewport_cases()},
    }
    for filename, value in files.items():
        write_json(output / filename, value)


def main() -> None:
    default_output = (
        Path(__file__).resolve().parents[3]
        / "src"
        / "tests"
        / "vitest"
        / "fixtures"
        / "lgrs"
        / ORACLE_VERSION
    )
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=default_output)
    args = parser.parse_args()
    generate(args.output.resolve())


if __name__ == "__main__":
    main()
