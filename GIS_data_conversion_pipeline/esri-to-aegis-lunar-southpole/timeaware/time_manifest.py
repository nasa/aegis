"""Build AEGIS time-manifest entries without bridging gaps in source coverage."""

from __future__ import annotations

from datetime import datetime

AEGIS_FMT = "%Y-%m-%dT%H:%M:%SZ"


def _parse(value: str) -> datetime:
    return datetime.strptime(value, AEGIS_FMT)


def _midpoint(first: str, second: str) -> str:
    first_time = _parse(first)
    second_time = _parse(second)
    return (first_time + (second_time - first_time) / 2).strftime(AEGIS_FMT)


def add_bounds_for_gaps(entries: list[dict[str, str]]) -> list[dict[str, str]]:
    """Add explicit bounds only when timestamps contain a discontinuity.

    The shortest positive interval establishes the series cadence. Any interval more than
    1.5 times that cadence splits the data into separate contiguous runs. Continuous series
    preserve the legacy ``datetime``/``dirName`` manifest shape.
    """
    ordered = sorted(entries, key=lambda entry: entry["datetime"])
    if len(ordered) < 2:
        return ordered

    intervals = [
        (_parse(current["datetime"]) - _parse(previous["datetime"])).total_seconds()
        for previous, current in zip(ordered, ordered[1:])
    ]
    positive_intervals = [interval for interval in intervals if interval > 0]
    if not positive_intervals:
        raise ValueError("Time manifest entries must have unique timestamps.")

    cadence = min(positive_intervals)
    gap_threshold = cadence * 1.5
    runs: list[list[dict[str, str]]] = [[]]
    for index, entry in enumerate(ordered):
        if index and intervals[index - 1] > gap_threshold:
            runs.append([])
        runs[-1].append(entry)

    if len(runs) == 1:
        return ordered

    bounded: list[dict[str, str]] = []
    for run in runs:
        for index, entry in enumerate(run):
            lower_bound = (
                entry["datetime"]
                if index == 0
                else _midpoint(run[index - 1]["datetime"], entry["datetime"])
            )
            upper_bound = (
                entry["datetime"]
                if index == len(run) - 1
                else _midpoint(entry["datetime"], run[index + 1]["datetime"])
            )
            bounded.append(
                {**entry, "lowerBound": lower_bound, "upperBound": upper_bound}
            )
    return bounded
