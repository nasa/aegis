# LGRS, MGRS and Artemis Condensed Coordinates

This directory implements the coordinate systems used by AEGIS's dynamic grids, coordinate
readouts and grid-north bearings. The Moon uses LGRS on the IAU 2015 lunar sphere. Earth uses
WGS84 UTM/UPS, labelled either as standard MGRS or with ACC-style letters for lunar navigation
training. Both Earth label schemes use the same projections and MGRS 100 km squares.

## Sources and their roles

- **McClernan, M.T. (2024), [Lunar Grid Reference System (LGRS) Terrestrial Navigational
  Training Grids in Artemis Condensed Coordinate (ACC) Format](https://www.usgs.gov/data/lunar-grid-reference-system-lgrs-terrestrial-navigational-training-grids-artemis-condensed),
  USGS data release, [doi:10.5066/P14KSANW](https://doi.org/10.5066/P14KSANW).** This is the
  basis for Earth training: WGS84 UTM coordinates, 1 km subdivisions within a 25 km area, and
  condensed references truncated to 10 m. It supplies site-specific training grids, including
  JSC and JETT sites. AEGIS's worldwide Earth area-prefix convention is described below.
- **McClernan, M.T., and others (2025), [Lunar grid systems, coordinate systems, and map
  projections for the Artemis missions and lunar surface navigation](https://www.usgs.gov/publications/lunar-grid-systems-coordinate-systems-and-map-projections-artemis-missions-and-lunar),
  USGS Techniques and Methods 11-E1, [doi:10.3133/tm11E1](https://doi.org/10.3133/tm11E1).**
  The lunar implementation follows this report's M2025 LTM/LPS parameters and LGRS/ACC
  conventions. The code identifies the relevant tables in [moon/constants.ts](moon/constants.ts):
  tables 6–10 for LTM, 13–16 for LPS, and 17 for the within-area ACC letters.
- **NGA, [Coordinate Systems](https://earth-info.nga.mil/?dir=coordsys&action=coordsys),
  especially [Universal Grids and Grid Reference Systems, NGA.STND.0037](https://earth-info.nga.mil/php/download.php?file=coord-grids).**
  This is the Earth MGRS basis: UTM/UPS regions, zone/band designations and 100 km square IDs.
  [earth/constants.ts](earth/constants.ts) contains the WGS84 parameters, MGRS AA lettering
  and GeoTrans polar letter tables used by the implementation.
- **[rbeyer/lgrs](https://github.com/rbeyer/lgrs), pinned to Python `lgrs==0.4.0`.** This is
  the lunar reference implementation used to generate test fixtures. Known boundary and
  numerical issues are recorded in [the upstream issue notes](../../../docs/lgrs-upstream-issues.md).
  The TypeScript implementation handles those cases explicitly.

## Earth coordinate methodology

### Projection and region selection

Inputs are WGS84 latitude/longitude in degrees; projected eastings and northings are metres.
[earth/zones.ts](earth/zones.ts) assigns each point to its own region:

- UTM zones 1–60 for `-80 <= latitude < 84`, including the Norway and Svalbard exceptions.
- UPS South below -80 degrees and UPS North at or above 84 degrees.
- Northern hemisphere at the equator; longitude conformed to `[-180, 180)`.

[earth/projection.ts](earth/projection.ts) caches proj4 converters. UTM uses scale 0.9996,
false easting 500,000 m and false northing 0 m north / 10,000,000 m south. UPS uses scale
0.994 and false easting/northing 2,000,000 m on WGS84. This ellipsoidal projection is
independent of the mission's spherical `planetRadius`.

### MGRS labels

[earth/mgrs.ts](earth/mgrs.ts) combines the zone/band, 100 km square ID and truncated
within-square digits. At 10 m precision, each axis has four digits: `15R TN 9751 7177`.
UPS references begin with a band (`A`, `B`, `Y` or `Z`) instead of a numbered UTM zone.
Supported precisions are 1, 10, 100, 1,000, 10,000 and 100,000 m; the last gives only the
zone/band and square. Digits are floored, never rounded.

### Earth ACC labels and the AEGIS area prefix

ACC's within-area letters and digits come from the lunar coordinate format. AEGIS adds a
worldwide prefix by subdividing each MGRS 100 km square into sixteen 25 km areas:

```text
<zone/band><100 km square><25 km easting letter><25 km northing letter> <ACC easting> <ACC northing>
15R        TN             D                     C                      X51           W77
```

[earth/acc.ts](earth/acc.ts) constructs the reference as follows:

1. Calculate the MGRS zone/band and 100 km square using the same projected point as MGRS.
2. For each axis, select `ABCD[floor((coordinate mod 100000) / 25000)]`. Easting comes first.
3. Within that 25 km area, select the 1 km letter from `-ABCDEFGHJKLMNPQRSTUVWXYZ`:
   index 0 is `-`, then `A` through `Z`, omitting `I` and `O`.
4. Truncate the remaining metres to the requested precision. At 10 m, each axis is one
   letter plus two digits; `X51 W77` is the condensed reference. The full reference is
   `15RTNDC X51 W77`. UPS uses the same subdivision but has no zone number.

Supported ACC precisions are 1, 10, 100, 1,000 and 25,000 m. The first four have three, two,
one and zero residual digits per axis; at 25,000 m the reference is the prefix alone.
Condensed references repeat every 25 km, so the area prefix is needed to disambiguate them.

The MGRS-square-plus-`ABCD` area prefix is an **AEGIS convention**. It is not a USGS-defined
worldwide terrestrial ACC namespace. The lunar 25 km area tables are sized for the Moon;
using them unchanged with Earth's larger zones would produce repeated area names.

### Worked examples

These 10 m references are reproduced by the independent Earth reference corpus:

| Location              | Latitude, longitude | MGRS               | Earth ACC, full   |
| --------------------- | ------------------- | ------------------ | ----------------- |
| JSC                   | 29.5593, -95.0900   | `15R TN 9751 7177` | `15RTNDC X51 W77` |
| Big Bend              | 29.25, -103.25      | `13R FN 7005 3695` | `13RFNCB V05 L95` |
| Iceland highlands     | 64.80, -17.00       | `28W DS 0499 8766` | `28WDSAD D99 M66` |
| Near the antimeridian | 0.0001, -179.9999   | `1N AA 6603 0001`  | `1NAACA R03 -01`  |

For JSC, UTM 15N gives E = 297,516.44 m and N = 3,271,776.23 m. The within-square
coordinates are 97,516.44 m and 71,776.23 m, selecting sub-area `DC`. Relative to that
25 km area's southwest corner they are 22,516.44 m and 21,776.23 m: kilometre letters
`X` and `W`, followed by the truncated 10 m digits `51` and `77`.

### Matching USGS training maps

AEGIS's dynamic Earth areas are anchored on UTM/UPS 25 km multiples. The JSC and JETT2
shapefiles examined during development use site-specific 25 km origins: respectively
(284,764, 3,259,593) m and (421,896, 7,177,775) m. Consequently, their grid lines and
condensed coordinates differ. The JSC point above is `M75 M18` on that USGS grid and
`X51 W77` on the AEGIS dynamic grid.

Missions that must match those published training maps use manually generated grids in
`server-file` mode. Changing the dynamic grid's label scheme does not align its origin
with an uploaded training grid.

## Lunar methodology

[moon/](moon/) implements M2025 on a sphere of radius 1,737,400 m: 45 eight-degree LTM
zones per hemisphere for `abs(latitude) < 80`, and LPS caps at either pole. LTM uses
scale 0.999, false easting 250,000 m and southern false northing 2,500,000 m; LPS uses
scale 0.994 and false easting/northing 500,000 m. Lunar area prefixes use the report's
LTM/LPS letter tables. Within each 25 km area, ACC uses the same 1 km letters described
above. Lunar projection, domain checks and numerical boundary handling live in
`moon/projection.ts`, `moon/crs.ts` and `moon/format.ts`.

## Integration and rendering

[system.ts](system.ts) resolves `mission.gridSystem` (`moon-m2025` or `earth-wgs84`).
Missing fields resolve to Moon and `lunar-acc`. Mission creation and the admin editor
persist the selection from the radius: above 4,000,000 m selects Earth. The editor also
enables computed coordinate readouts for `dynamic-lgrs` and disables them for `server-file`.
The map and readouts consume the stored selection.

On Earth, `mission.earthGridLabelScheme` selects `lunar-acc` or `mgrs`. The map menu's user
override changes the displayed scheme; exports use the mission default and add canonical
`mgrsCoordinates` for Earth items, including when computed grid readouts are disabled.
Readouts and exports use 10 m precision. Grid bearings project both endpoints into the
origin's region, including across a zone boundary; spherical distance calculations remain
separate.

[LgrsGridSystem](../../typings/lgrs.d.ts) separates body-specific projection, formatting
and region geometry from [grid/plan.ts](grid/plan.ts), [grid/clip.ts](grid/clip.ts) and
[gridBinding.ts](gridBinding.ts). The planner clips each region's constant-easting/northing
lines, densifies curves in the map projection and coarsens spacing to respect rendering
caps. Lunar and ACC box tiers are 10, 100, 1,000 and 25,000 m; MGRS adds 10,000 m and
uses 100,000 m as its coarsest tier. Earth grids are hidden at the continental zone tier.

### Earth boundary and label semantics

Geographic regions and projected boxes have exact half-open boundaries, with no snapping.
A box of size `p` owns `[k*p, (k+1)*p)` on each axis. Point readouts use the point's region,
latitude band and projected coordinates. Renderer labels use the exact grid-southwest box
corner, with the band determined from the box centre in the region being drawn. The
system labels a box only when its corner belongs to that region. A latitude-band boundary
can therefore make a point's band differ from the label on its box.

## Validation and maintenance

[scripts/lgrs-reference/](../../../scripts/lgrs-reference/) generates seeded fixtures with
pinned Python dependencies. Earth projections are checked against pyproj; 100 km square
IDs are cross-checked with the GeoTrans-based Python `mgrs` package. An independent Python
implementation supplies ACC labels and classification. This checks consistency with the
AEGIS convention; it is not external certification of the custom prefix. Lunar fixtures
come from `lgrs==0.4.0`, with explicit handling of the documented upstream issues.

Earth tests require projection error at most 1 micrometre per axis and exact formatting
from projected coordinates. End-to-end strings must match exactly when the oracle point
is at least 10 micrometres from every box boundary; closer cases are checked against
adjacent labels. The classifier deliberately assigns exactly 84 degrees north to UPS,
where GeoTrans retains UTM near the seam. See the [Earth corpus README](../../tests/vitest/fixtures/lgrs-earth/v1/README.md)
for fixture schemas, boundary cases and package differences.

Run from the repository root:

```bash
npm run test:vitest -- src/tests/vitest/utils/lgrs
npm run test:vitest:browser -- Grid.browser MouseCoordinateDisplay AdminMissionGrid
```

To regenerate reference data, install `uv` and run the commands below. Review changes to
the pinned dependencies and fixture metadata together; keep the Python oracle independent
of the TypeScript implementation and review boundary changes explicitly.

```bash
npm run lgrs:reference-corpus
npm run lgrs:reference-corpus-earth
```
