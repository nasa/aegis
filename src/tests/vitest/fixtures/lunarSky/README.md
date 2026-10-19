# Lunar sky reference validation

`../../utils/lunarSky.test.ts` compares AEGIS against 99 independently computed
site/time cases, for both Sun and Earth. The fixtures cover the lunar near side
and south polar region only. Expected numbers come from NASA/JPL software;
neither the generator nor its dependencies import AEGIS or Astronomy Engine.

These comparisons establish agreement within explicit tolerances at the sampled
locations and epochs. They are not a mathematical proof for every input, an
observational calibration, or a guarantee of accuracy outside this corpus.

## Independent references

1. **Geometric SPICE oracle.** NASA NAIF's
   [azlcpo](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/azlcpo_c.html)
   calculates the entire observer-to-target azimuth/elevation solution. We call
   it through SpiceyPy 8.0.0 / CSPICE N0067, using `ELLIPSOID`, `abcorr=NONE`,
   clockwise azimuth, positive-up elevation, and observer frame `IAU_MOON`.
   SPICE `georec` builds the observer position and `str2et` converts UTC to ET.
   This avoids reimplementing AEGIS's rotation or local-basis math in the oracle.
   Ephemerides come from [DE440s](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp),
   orientation from [pck00011.tpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc),
   and time conversion from [naif0012.tls](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/naif0012.tls).
   Kernel SHA-256 values are pinned in the generator and recorded in the fixture.

2. **Apparent Horizons oracle.** Direct results from the
   [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), requesting
   Sun `10` and Earth `399` from `coord@301` (a user-defined Moon surface site).
   Quantity 4 returns airless, apparent target-center azimuth and elevation.
   The [Horizons manual, quantity 4](https://ssd.jpl.nasa.gov/horizons/manual.html#obsquan)
   specifies clockwise-from-north azimuth and elevation above the local tangent
   plane, including light-time, aberration, and gravitational light deflection.
   Each exact request URL, API version, raw response path and checksum is in
   `reference.json`; the complete responses are in `horizons/` for auditing.
   Their headers identify DE441 and `MEAN_ME (high precision)` lunar orientation.

Both references are independent of the production library, but are not two
independent observational measurements: both use JPL ephemeris products. SPICE
intentionally shares the IAU orientation convention with the application.

## Coordinate and time conventions

- Inputs are selenographic latitude and east-positive longitude in degrees,
  height in meters above a **1,737,400 m sphere**, and UTC timestamps. The Moon's
  SPICE/Horizons reference radii are all 1,737.4 km, so geodetic and geocentric
  latitude agree. Heights are converted to kilometers only for NASA interfaces.
- Outputs refer to **body centers**, not upper limbs; azimuth is north=0,
  east=90, south=180, west=270. Negative elevations are retained. No terrain,
  refraction, or visible-horizon dip is applied to these directions.
- AEGIS uses geometric, simultaneous positions. Horizons apparent positions
  intentionally differ. The [JPL lunar rotation update](https://ssd.jpl.nasa.gov/announcements/an20210929.html)
  also explains its higher-precision mean-Earth orientation. NAIF's text PCK
  describes `IAU_MOON` as a polynomial/trigonometric approximation to the mean-Earth
  frame; it is not the high-precision binary lunar orientation model.
- Astronomy Engine approximates UT1 and UTC and predicts delta-T; SPICE uses
  the pinned leap-second kernel. Future leap seconds are unknown. Thus even
  the geometric comparison is not expected to be bit-for-bit identical.
- At exactly the south pole, longitude selects an arbitrary local north
  convention. External numerical fixtures stop at latitude -89.9999 degrees;
  separate analytic tests check continuity and longitude-independent projected
  directions at -90 degrees.

## Coverage and acceptance limits

Nine site/height combinations include the mission lander location
(-84.223397, 33.5021945, 5414.891 m), the near south pole, near-side equator,
eastern/western near side, northern/southern near-side midlatitudes, and the
lander latitude/longitude at -5 km and +100 km. The last two are synthetic
height stress cases, not terrain claims. All fixture longitudes are within
60 degrees of the near-side prime meridian. There are no far-side or north-pole
fixtures.

Six shared epochs span 1969–2040, including J2000 and leap day 2024. The lander
adds monthly 2028 samples, 32 consecutive daily samples beginning August 1,
and the original mission example times. This includes sunrise/sunset, day/night,
0/360 azimuth wrap, Earth above/below the polar horizon, and near-zenith directions.

| Reference         | Maximum direction error allowed | Maximum elevation error allowed | Maximum azimuth error allowed when abs(elevation) < 80° |
| ----------------- | ------------------------------: | ------------------------------: | ------------------------------------------------------: |
| SPICE geometric   |              0.005° (18 arcsec) |                          0.005° |                                                   0.01° |
| Horizons apparent |               0.01° (36 arcsec) |                           0.01° |                                                   0.05° |

Direction error uses spherical angular separation (haversine), so wrapping and
near-zenith azimuth instability cannot create misleading failures or passes.
Elevation and direction limits apply to **every** case. The separate raw azimuth
bound is omitted within 10 degrees of zenith/nadir because azimuth is singular
there; this does not relax the direction bound. These are engineering regression
thresholds for this corpus, with margin for the model differences above. They
are not uncertainty estimates or NASA-specified accuracy guarantees.

Measured maxima with Astronomy Engine 2.1.19 when these fixtures were introduced:

| Reference | Sun direction difference | Earth direction difference |
| --------- | -----------------------: | -------------------------: |
| SPICE     |                0.002461° |                  0.000739° |
| Horizons  |                0.006752° |                  0.003268° |

Values above are rounded upward. The upstream
[Astronomy Engine accuracy target](https://github.com/cosinekitty/astronomy#overview)
is approximately one arcminute; this corpus agrees more closely, which does not
extend that guarantee to arbitrary epochs or observing circumstances.

Height-difference tests additionally require agreement with SPICE's Earth
parallax change to 0.00001°. They catch ignored height and unit mistakes that
could be masked by absolute ephemeris tolerances. Analytic tests check longitude
periodicity, reference-radius/height consistency, south-pole continuity, and
south-polar stereographic grid convergence (grid bearing = true bearing +
longitude for this projection). Invalid/collapsed projection fallbacks are also
tested.

## Run, audit, and regenerate

Normal offline test run from the repository root:

```powershell
npm run test:vitest -- src/tests/vitest/utils/lunarSky.test.ts
```

Regeneration requires Python, NumPy, SpiceyPy, and network access, but adds no
application or CI dependency. From the repository root on Windows:

```powershell
python -m venv .local/lunar-sky-reference-venv
.local/lunar-sky-reference-venv/Scripts/python -m pip install numpy==2.0.2 spiceypy==8.0.0
.local/lunar-sky-reference-venv/Scripts/python src/tests/vitest/fixtures/lunarSky/generate.py
npx prettier --write src/tests/vitest/fixtures/lunarSky/reference.json
npm run test:vitest -- src/tests/vitest/utils/lunarSky.test.ts
```

On Unix, use the virtual environment's `bin/python`. Kernels (~32 MB) are cached
under `.local/lunar-sky-kernels`; only small JSON/text fixtures belong in git.
The generator verifies kernel checksums, Horizons model headers, returned epochs,
row counts, and finite angles. Network calls are sequential. Review changed
responses, metadata and differences before accepting a refresh; never regenerate
expected numbers from the implementation being tested or widen tolerances just
to make a regression pass. Horizons is a live service and future responses can
change when its ephemeris/time models are updated.
