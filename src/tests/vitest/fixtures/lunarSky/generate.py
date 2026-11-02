"""Refresh independent lunar sky oracles; never imports AEGIS or Astronomy Engine.

See README.md for setup, conventions, and the accuracy contract. Normal tests
read the committed JSON and need neither Python, SPICE, nor network access.
"""

import csv
import hashlib
import io
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen, urlretrieve

import spiceypy as spice


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
CACHE = ROOT / ".local" / "lunar-sky-kernels"
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
KERNEL_BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
KERNELS = {
    "spk/planets/de440s.bsp": "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2",
    "pck/pck00011.tpc": "3dff7b1dbeceaa01f25467767d3fa25816051c85d162d1edf04acb310ee28bb1",
    "lsk/naif0012.tls": "678e32bdb5a744117a467cd9601cd6b373f0e9bc9bbde1371d5eee39600a039b",
}
RADIUS_METERS = 1737400
DATES = [
    "1969-07-20T20:17:40Z",
    "2000-01-01T12:00:00Z",
    "2024-02-29T06:30:00Z",
    "2028-08-04T22:00:00Z",
    "2030-12-21T18:45:00Z",
    "2040-06-21T00:00:00Z",
]
# Synthetic sites exercise coordinates, not claims about historical landing sites.
SITES = [
    ("lander", -84.223397, 33.5021945, 5414.891),
    ("near-south-pole", -89.9999, 33, 0),
    ("near-side-equator", 0, 0, 0),
    ("eastern-near-side", 0, 60, 0),
    ("western-near-side", 0, -60, 0),
    ("northern-midlatitude", 45, -60, 0),
    ("southern-midlatitude", -45, 60, 0),
    ("below-datum", -84.223397, 33.5021945, -5000),
    ("above-datum", -84.223397, 33.5021945, 100000),
]


def dates_for(site_id):
    dates = set(DATES)
    if site_id == "lander":
        # Daily samples span a full synodic month: horizon crossings and azimuth wrap.
        start = datetime(2028, 8, 1, 22, tzinfo=timezone.utc)
        dates.update((start + timedelta(days=day)).strftime("%Y-%m-%dT%H:%M:%SZ")
                     for day in range(32))
        dates.update(f"2028-{month:02d}-01T00:00:00Z" for month in range(1, 13))
        dates.update(["2028-08-05T23:00:00Z", "2028-08-08T23:00:00Z"])
    return sorted(dates)


def horizons(site, dates, target):
    site_id, lat, lng, height = site
    params = {
        "COMMAND": target, "CENTER": "coord@301", "EPHEM_TYPE": "OBSERVER",
        "COORD_TYPE": "GEODETIC", "SITE_COORD": f"{lng},{lat},{height / 1000}",
        "QUANTITIES": "4", "TIME_TYPE": "UT", "TLIST_TYPE": "JD",
        "TIME_DIGITS": "SECONDS", "CAL_FORMAT": "BOTH", "CAL_TYPE": "GREGORIAN",
        "CSV_FORMAT": "YES", "EXTRA_PREC": "YES", "ANG_FORMAT": "DEG",
        "APPARENT": "AIRLESS", "ELEV_CUT": "-90", "SKIP_DAYLT": "NO",
    }
    encoded = {key: f"'{value}'" for key, value in params.items()}
    jds = [datetime.fromisoformat(date.replace("Z", "+00:00")).timestamp() / 86400
           + 2440587.5 for date in dates]
    encoded["TLIST"] = " ".join(f"'{jd:.9f}'" for jd in jds)
    url = API + "?" + urlencode({"format": "json", **encoded})
    with urlopen(url, timeout=90) as response:
        payload = json.load(response)
    if "error" in payload:
        raise RuntimeError(payload["error"])
    raw = payload["result"]
    if "Center body name: Moon (301)" not in raw or "NO (AIRLESS)" not in raw:
        raise ValueError("Unexpected Horizons observer/corrections")
    if not all(value in raw for value in ["1737.4", "DE441", "MEAN_ME"]):
        raise ValueError("Horizons model changed: review before refreshing the fixture")
    header = next(line for line in raw.splitlines() if "Azimuth_(a-app)" in line)
    columns = [cell.strip() for cell in next(csv.reader([header]))]
    az_index = columns.index("Azimuth_(a-app)")
    el_index = columns.index("Elevation_(a-app)")
    jd_index = next(i for i, column in enumerate(columns) if column.startswith("Date_________JD"))
    table = raw.split("$$SOE\n", 1)[1].split("$$EOE", 1)[0]
    rows = list(csv.reader(io.StringIO(table.strip())))
    if len(rows) != len(dates):
        raise ValueError("Horizons dropped a requested epoch")
    values = []
    for row, jd in zip(rows, jds):
        if abs(float(row[jd_index]) - jd) > 1e-8:
            raise ValueError("Horizons returned an unexpected epoch/time scale")
        az, el = float(row[az_index]), float(row[el_index])
        if not (0 <= az < 360 and -90 <= el <= 90):
            raise ValueError("Invalid azimuth/elevation")
        values.append({"azimuth": az, "elevation": el})
    raw_path = HERE / "horizons" / f"{site_id}-{target}.txt"
    raw_path.parent.mkdir(exist_ok=True)
    raw_path.write_bytes(raw.encode("utf-8"))
    return values, {
        "site": site_id, "target": target, "url": url,
        "signature": payload["signature"], "rawFile": str(raw_path.relative_to(HERE)).replace("\\", "/"),
        "sha256": hashlib.sha256(raw.encode()).hexdigest(),
    }


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    kernels = []
    for name, expected_hash in KERNELS.items():
        path = CACHE / Path(name).name
        if not path.exists():
            urlretrieve(KERNEL_BASE + name, path)
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != expected_hash:
            raise ValueError(f"Kernel checksum mismatch: {path}")
        kernels.append({"url": KERNEL_BASE + name, "sha256": actual_hash})
        spice.furnsh(str(path))
    # The production model and Horizons both use a sphere of this radius.
    assert list(spice.bodvrd("MOON", "RADII", 3)[1]) == [1737.4] * 3
    records, requests = [], []
    try:
        for site in SITES:
            site_id, lat, lng, height = site
            dates = dates_for(site_id)
            print(f"Fetching {site_id}: {len(dates)} epochs", flush=True)
            sun, sun_request = horizons(site, dates, "10")
            earth, earth_request = horizons(site, dates, "399")
            requests.extend([sun_request, earth_request])
            # SPICE supplies the geodetic site, orientation, ephemeris, and local
            # az/el conversion; no copy of the application's vector math here.
            observer = spice.georec(math.radians(lng), math.radians(lat),
                                    height / 1000, RADIUS_METERS / 1000, 0)
            for i, date in enumerate(dates):
                et = spice.str2et(date)
                geometric = {}
                for body in ["sun", "earth"]:
                    state, _ = spice.azlcpo("ELLIPSOID", body.upper(), et, "NONE",
                                            False, True, observer, "MOON", "IAU_MOON")
                    geometric[body] = {"azimuth": math.degrees(state[1]),
                                       "elevation": math.degrees(state[2])}
                records.append({
                    "id": f"{site_id}/{date}", "site": site_id,
                    "point": {"lat": lat, "lng": lng}, "heightMeters": height,
                    "radiusMeters": RADIUS_METERS, "utc": date,
                    "spice": geometric, "horizons": {"sun": sun[i], "earth": earth[i]},
                })
    finally:
        spice.kclear()
    output = {
        "provenance": {
            "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
            "spiceypyVersion": spice.__version__, "toolkitVersion": spice.tkvrsn("TOOLKIT"),
            "spiceFrame": "IAU_MOON", "spiceAberration": "NONE",
            "horizonsQuantity": "4: airless apparent target-center azimuth/elevation",
            "kernels": kernels, "horizonsRequests": requests,
        },
        "cases": records,
    }
    (HERE / "reference.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} cases", flush=True)


if __name__ == "__main__":
    main()
