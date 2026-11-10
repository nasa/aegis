# lgrs 0.4.0: issues found while building the AEGIS reference corpus

While generating the TypeScript LGRS test corpus from `lgrs==0.4.0` (see
`docs/lgrs-whole-moon-plan.md` §8), we found several cases where the library's output is wrong or
it raises on valid input. Each section below is a self-contained draft for
<https://github.com/rbeyer/lgrs/issues/>, ordered by impact. Every snippet was run and its output
pasted verbatim (source excerpts are quoted from the installed package).

Environment for all reproductions: `lgrs 0.4.0` (tag `v0.4.0`, commit `1f11a12a`), `pyproj 3.8.0`,
`PROJ 9.8.1`, CPython 3.13, Windows 11. Line numbers refer to the installed 0.4.0 sources.

| #   | Title                                                            | Impact                                                          | File upstream?                     |
| --- | ---------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| 1   | LPS west-half easting on an exact 25 km multiple                 | Wrong area letter, digits `25000`, `IndexError` from `to_acc`   | Yes                                |
| 2   | Valid LPS points on the 180° meridian fail validation            | `CoordinateError` for a whole line through each pole            | Yes                                |
| 3   | Longitude just below 180° yields LTM zone 46                     | `ValueError` on valid input                                     | Yes                                |
| 4   | LTM northing loses up to ~3 cm within ~1e-6° of the equator      | Wrong northing area/digits for points just south of the equator | Yes (root cause is PROJ; see text) |
| 5   | LPS points generated from exactly ±80° fail their own validation | Round trip `LatLonPoint` → `LpsPoint` → re-validate raises      | Yes, low priority                  |
| 6   | Plain `floor` exposes float noise on the −180° meridian at ±80°  | Band `A`/`Y` instead of `B`/`Z`                                 | Optional comment on the TODO       |

---

## 1. LPS west-half easting on an exact 25 km multiple gives digits `25000` and the wrong area

**Summary.** For an LPS point in the west half (`easting < 500000`) whose offset from the false
easting is an exact multiple of 25,000 m, `LpsPoint._to_lgrs` produces easting digits `25000` and
names the 25 km area to the west. `to_acc` then raises `IndexError`. Grid nodes and integer
coordinates hit this case all the time.

**Reproduction.**

```python
from lgrs.coords import LpsPoint

for e in (474_999.0, 475_000.0, 475_001.0):
    p = LpsPoint("S", e, 510_000.0)
    print(e, p.to_lgrs(precision=1).string, p.to_lgrs(precision=25_000).string)
    try:
        print("   acc10:", p.to_acc(precision=10).string)
    except Exception as exc:
        print("   acc10: EXC", type(exc).__name__, exc)
```

```text
474999.0 AYN2499910000 AYN
   acc10: AYNZ99K00
475000.0 AYN2500010000 AYN
   acc10: EXC IndexError string index out of range
475001.0 AZN0000110000 AZN
   acc10: AZN-00K00
```

The same thing happens in the north (`LpsPoint("N", 475_000.0, 510_000.0).to_acc(precision=10)`
raises `IndexError`).

**Expected.** `E = 475000` is the west edge of area `Z`, so the 1 m label should be
`AZN0000010000` and the 10 m ACC `AZN-00K00`. Every value in `[475000, 500000)` should belong to
`AZN`, matching the half-open convention used in the east half and for northings.

**Cause.** `LpsPoint._to_lgrs`, `coords.py` lines 3211 and 3218 (Eqs. 103 and 105):

```python
ea_idx = 23 - _floor(abs(e_adj) // 25_000)  # Eq. 103
...
e = 25_000 - (abs(e_adj) % 25_000)  # Eq. 105
```

When `abs(e_adj)` is a multiple of 25,000, `abs(e_adj) % 25_000 == 0`, so `e == 25000` and
`ea_idx` is one area too far west. The existing TODO next to Eq. 103 already questions where the
`abs()` belongs.

**Suggested fix.** Use floor division and a non-negative modulo on the signed offset, which
equals the current formulas everywhere except on exact multiples:

```python
if is_in_west_half:
    ea_idx = 24 + _floor(e_adj / 25_000)  # == 23 - floor(|e_adj| / 25000) off the boundary
    e = e_adj % 25_000                     # Python % is non-negative for a positive divisor
```

---

## 2. Valid LPS points on the 180° meridian fail validation

**Summary.** Any LPS point whose inverse longitude is exactly 180° (for example `E = 500000`,
`N < 500000` in the south, or `N > 500000` in the north) raises `CoordinateError` on
construction. This rejects a whole line through each pole.

**Reproduction.**

```python
from lgrs.coords import LpsPoint

for hemisphere, e, n in (("S", 500_000.0, 400_000.0), ("N", 500_000.0, 600_000.0)):
    try:
        LpsPoint(hemisphere, e, n)
    except Exception as exc:
        print(hemisphere, type(exc).__name__, exc)
    print("  to_latlon:", LpsPoint(hemisphere, e, n, validate=False).to_latlon(validate=False))

print(LpsPoint("S", 500_000.0, 600_000.0).to_acc(precision=10).string)  # control: the 0° meridian
```

```text
S CoordinateError
  Validation conformed the following value(s):
    longitude: 180.0 --> -180.0
  to_latlon: 86.68323175012894° S, 180.0° E
N CoordinateError
  Validation conformed the following value(s):
    longitude: 180.0 --> -180.0
  to_latlon: 86.68323175012894° N, 180.0° E
BAS-00-00
```

**Expected.** Both points are valid. Their labels (`BAJ-00-00` and `ZAS-00-00` with
`validate=False`) are correct, and `to_latlon` should return longitude `-180.0`, which is inside
the documented `[-180, 180)` interval.

**Cause.** `LpsPoint._to_latlon` (`coords.py` line 3163) builds `LatLonPoint(latitude=lat, longitude=lon,
validate=False)` straight from the pyproj inverse, which returns `+180.0` on that meridian.
Validating the derived point goes through `BaseCoordinate.validate()` (`coords.py` line 1243), which
treats "would conform the value" as invalid, so `180.0 --> -180.0` raises.

**Suggested fix.** Conform the longitude (`_database._conform_longitude`) in
`LpsPoint._to_latlon` and `LtmPoint._to_latlon` before constructing the `LatLonPoint`, or build
it with validation enabled so that it is conformed rather than rejected.

---

## 3. A longitude just below 180° yields LTM zone 46

**Summary.** `LatLonPoint(0, 179.99999999999997)` is a valid input inside `[-180, 180)`, but the
zone calculation returns 46 and the conversion raises `ValueError`.

**Reproduction.**

```python
import math
from lgrs.coords import LatLonPoint

lon = math.nextafter(180.0, 0.0)  # 179.99999999999997
print(lon + 180)                   # 360.0
LatLonPoint(0.0, lon).to_lgrs(precision=10)
```

```text
360.0
ValueError: `number` must be in the range [1, 45], not: 46
```

`LatLonPoint(0.0, 179.9999999999999).to_lgrs(precision=10)` works (`45NKL21270000`).

**Cause.** `database._calculate_ltm_zone_number` (`database.py` lines 77–81) computes
`(longitude + 180) / 8 + 1` (Eq. 13). For the largest double below 180, `longitude + 180`
rounds to exactly `360.0`, so the zone is 46.

**Suggested fix.** Clamp: `zone_int = min(int(zone_float), 45)` (and keep `zone_float` consistent
for the `prefer_west_ltm` check).

---

## 4. LTM northing loses up to ~3 cm near the equator (PROJ spherical TM)

**Summary.** On the lunar sphere, the LTM forward and inverse lose precision within about 1e-6°
(~3 cm) of the equator. For points just south of the equator, the northing snaps to exactly the
false northing (2,500,000), so the label names the wrong northing area with the wrong digits. The
inverse also snaps small northings to latitude 0.

**Reproduction.**

```python
import math
from lgrs.coords import LatLonPoint, LtmPoint

R, k0 = 1_737_400.0, 0.999

def exact_northing(lat, dlon):  # closed-form spherical TM, false northing omitted
    phi, dl = math.radians(lat), math.radians(dlon)
    return k0 * R * math.atan2(math.tan(phi), math.cos(dl))

for lat in (-1e-7, -1e-6):
    p = LatLonPoint(lat, 3.9)  # zone 23, central meridian 0
    n = p._to_lps_or_ltm(validate=False).northing
    print(lat, p.to_acc(precision=1).string, n, 2_500_000 + exact_northing(lat, 3.9))

q = LtmPoint(23, "N", 250_010.0, 0.01, validate=False).to_latlon(validate=False)
print(q.latitude, math.degrees(0.01 / (k0 * R)))
```

```text
-1e-07 23MKFT234-000 2500000.0 2499999.996963666
-1e-06 23MKET234Z999 2499999.974136612 2499999.96963666
0.0 3.301089711392198e-07
```

The correct 1 m ACC for `(-1e-7, 3.9)` is `23MKET234Z999`; lgrs returns `23MKFT234-000`, which
is the box north of the equator. Over a sweep of latitudes within 1e-3° of the equator and
longitudes across zone 23, the largest northing error we measured was 3.03 cm (at `lat = -1e-6`,
`dlon = 1e-6`).

**Cause.** This comes from PROJ, not lgrs. On a sphere, PROJ's `tmerc` uses the Evenden/Snyder
spherical formulas, whose forward computes the northing through `acos(...)`. That loses precision
as the argument approaches 1, i.e. at the equator. `+approx`, `+algo=poder_engsager` and
`+algo=evenden_snyder` all give the same result on a sphere:

```text
+proj=tmerc ... +R=1737400   lat=1e-7, dlon=0.1  ->  N = 0.0   (exact 0.003029 m)
```

**Suggested handling in lgrs.** This only matters at 1 m precision within a few centimetres of
the equator, but there the label is wrong. Options:

- compute LTM on the sphere in closed form (`N = k0·R·atan2(tan φ, cos Δλ)`,
  `φ = asin(sin D / cosh x)`), which is exact to float precision; or
- document the limitation and report it to PROJ (spherical `tmerc` forward and inverse near the
  equator).

---

## 5. LPS points generated from exactly ±80° fail their own validation

**Summary.** `LatLonPoint(-80, lon)` is assigned to LPS (`|lat| >= 80`), but reconstructing an
`LpsPoint` from the resulting easting/northing raises "should be in LTM region". The round trip
`LatLonPoint` → `LpsPoint` → validate is not closed on the seam.

**Reproduction.**

```python
from lgrs.coords import LatLonPoint, LpsPoint

for lat, lon in ((-80.0, 10.0), (-80.0, -180.0), (80.0, -180.0)):
    q = LatLonPoint(lat, lon)._to_lps_or_ltm(validate=False)
    try:
        LpsPoint(q.hemisphere, q.easting, q.northing)
        print(lat, lon, "ok")
    except Exception as exc:
        print(lat, lon, type(exc).__name__, str(exc).strip().splitlines()[0][:90])
```

```text
-80.0 10.0 CoordinateError For the given constraints, Constraints(), location should be in LTM region, ...
-80.0 -180.0 CoordinateError For the given constraints, Constraints(), location should be in LTM region, ...
80.0 -180.0 CoordinateError For the given constraints, Constraints(), location should be in LTM region, ...
```

**Cause.** `_validate_by_reconstruction` (`coords.py` line 1192) converts the point back to
lat/lon through `_conform_to_latlon_points` and re-projects it. For these points that
reconstruction returns latitude `-79.99999999999999` (while `to_latlon()` returns exactly
`-80.0`), which falls on the LTM side of the strict `abs(lat) < 80` test.

**Suggested fix.** Apply a small tolerance (for example 1e-9° or a sub-micrometre radius) when
validating projected points against the ±80° seam, or validate LPS membership by radius from the
pole (`r ≤ 2·k0·R·tan(5°)`) rather than through the inverse latitude.

---

## 6. Plain `floor` exposes float noise on the −180° meridian (FYI for the `_smart_truncate` TODO)

**Summary.** `coords._smart_truncate` now floors without tolerance (the TODO says this is being
tested). At `lat = ±80`, `lon = -180`, pyproj returns `E = 499999.99999999994` instead of
`500000`, because `sin(-π)` is not exactly 0 in floating point. The point therefore lands in the
west half and gets band `A`/`Y` with easting digits `24999`, while `lon = 0` and points on the
same meridian at other latitudes (for example `lat = -85`) get band `B`/`Z`.

```python
from lgrs.coords import LatLonPoint

print(LatLonPoint(-80.0, -180.0).to_acc(precision=1).string)  # AZ-Z999X818
print(LatLonPoint(-85.0, -180.0).to_acc(precision=1).string)  # BAF-000Z197
```

This is borderline (the coordinate is genuinely within 1e-10 m of the band line), so we suggest
mentioning it on the `_smart_truncate` TODO rather than filing it on its own. For reference, the
AEGIS TypeScript port snaps projected LPS values within 1e-9 m of an integer before flooring,
which reproduces every lgrs 0.3.0 label we compared against; whether such a small snap avoids
the zone-boundary regression the TODO mentions would need checking against your test suite.

---

## Checked and not reported

These are documented in the corpus `rejected` categories, but they are not lgrs bugs:

- **`-`/`+` LPS northing area letters at the domain edge** (e.g. `BA+-000B181` at −80°). These are
  the partial edge areas in M2025 Tables 15/16, not an error.
- **Points exactly on an LTM zone meridian.** Our generator pre-emptively marked these as
  ambiguous, but the oracle round-trips them correctly (e.g. `(10, -172)` → `2N` → `-172.0`).
- **pyproj LPS inverse latitude imprecision within a few centimetres of the pole.** Below 1 µm
  except right at the pole, and it does not change any label.
