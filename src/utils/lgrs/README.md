# AEGIS coordinate and grid integration

AEGIS uses [Planetary Grid Reference](https://github.com/bfeist/planetary-grid-reference)
for lunar LGRS/ACC, Earth analog grids, coordinate projections, and render-plan geometry.
The library is a JavaScript/TypeScript port of selected aspects of Python LGRS for
browser use. Its repository owns the numerical algorithms, reference fixtures,
Python oracle, benchmarks, source methodology, and upstream issue notes.

## Application boundary

- `system.ts` maps mission settings and user label-scheme overrides to the library's
  grid systems. Missing mission fields retain lunar defaults.
- `mapProjection.ts` maps mission projection settings to the library's map projection input.
- `compatibility.ts` applies mission radius and projection policy and supplies admin messages.
- `display.ts` adapts `AEGISPoint`, chooses application precision, and supplies UI text.
- `bearing.ts` computes grid-north bearings using library projections and AEGIS's
  surf-nav range/bearing convention. Both endpoints use the origin's grid region.

React components, OpenLayers rendering, mission persistence, readouts, and export
policy remain in AEGIS. Runtime engine imports use the package's documented root,
`/moon`, `/analogs`, and `/grid` entry points. Ambient aliases in `src/typings/lgrs*.d.ts`
refer to the package's exported types.

## Matching USGS training maps

The dynamic Earth analog mode uses WGS84 UTM/UPS, with MGRS square IDs underlying
its custom 25 km ACC areas. Those areas are anchored on projected 25 km multiples.
Published USGS terrestrial training grids can have site-specific origins, so their
lines and condensed labels can differ. Missions that must match those maps use
manually generated grids in `server-file` mode. Switching label schemes does not
change the dynamic grid origin.

Earth missions support ACC and canonical MGRS labels. User overrides affect the
map and readouts; exports use the mission default and retain canonical Earth
`mgrsCoordinates`. The Moon uses LGRS/ACC. Existing mission identifiers and scheme
values remain compatible with saved missions.

## Validation

AEGIS retains mission-policy, readout, export, bearing, and browser integration tests.
The small lunar bearing corpus is retained here because bearing calculations are
application-owned; its metadata identifies the pinned Python LGRS reference.
Independent projection, formatting, clipping, and planning tests run in the library.

```sh
npm run test:vitest -- src/tests/vitest/utils/lgrs src/tests/vitest/utils/geoMath.test.ts src/tests/vitest/utils/export.test.ts
npm run test:vitest:browser -- Grid.browser MouseCoordinateDisplay AdminMissionGrid MapMenuGridScheme MapMenuProvider MapMenuMinimapBridge
```
