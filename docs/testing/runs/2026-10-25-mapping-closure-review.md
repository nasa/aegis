# Playwright mapping closure review

Catalog review on 2026-10-25 against the current working tree. The catalog now
has **253/253 complete eligible mappings (100%)** and **146/146 complete P0
mappings (100%)**. The prior mapping checkpoint was 232/253 (91.7%) and
131/146 P0 (89.7%). The denominator and scenario contracts were preserved.

The review added 21 complete mappings since that checkpoint after inspecting
their Playwright assertions and fixtures. New mapped evidence includes scoped
authorization, admin role policies, raster and execution concurrency, peer graph
observations, restart durability, distinct-user presence, admin workflows, REST
response classes, keyboard focus, selected responsive layouts and cross-browser
map/editing discovery. The catalog lists the exact tests.

The last four partial contracts now have these assertions:

| Scenario     | Final clause evidence                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PRESET-004` | The Earth XYZ fixture checks tile coordinate `[4, 8, 8]`, its unflipped URL, the expected zoom resolution and a rendered red feature at the declared map coordinate. Named TMS, COG, GeoJSON and PMTiles source/projection pairs remain covered. |
| `ADMIN-006`  | File-manager rows are checked in name and size order. A small file and a one-MiB file provide a distinct size-order oracle alongside byte preservation, rename/deletion and path-scope checks.                                                   |
| `ACCESS-002` | High-DPI editor/dashboard bounds include 360px, 641px and wide viewports. A long station label must wrap; report and timeline checks exercise narrow layouts alongside reachable editor actions and expanded lists.                              |
| `ACCESS-005` | A report tab changes named warning status and icon, then opens by keyboard. Validation text and disabled controls remain covered; slope legend labels preserve meaning when switching between standard and colorblind palettes.                  |

## Mapping validation

`npm run docs:playwright-scenarios` regenerated the report and area chapters.
`npm run test:playwright:scenarios:complete` passed at 253/253 with zero gaps,
zero partial rows, all 146 P0 scenarios and all 81 registered surfaces mapped.
Playwright discovery confirms mapped test identities. The generated report's
**browser tests executed: 0** refers only to mapping generation: that command
discovers tests without launching browsers. It is not a result for separately
executed Playwright suites, which require their own run record.

The historical [ninety-percent validation record](2026-10-25-ninety-percent-coverage.md)
retains the prior executed results and its narrower scope; those pass counts do
not validate these new mappings.
