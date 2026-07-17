# OpenLayers — TODO

> Pre-merge work (smoke tests, manual QA, Leaflet removal) is complete. The items
> below are post-merge backlog.

## Map Features

- [ ] Upgrade circle styling system — checkerboard, better dashed color handling, text styling
- [ ] Redesign mapDirective system to be React-first — plan in [CONTEXT-MENU-INTERACTIONS.md](CONTEXT-MENU-INTERACTIONS.md)
- [ ] Add gazetteer layer type for place labels
- [ ] Clean up `esriPmtilesGrid.ts` / `tilemapResource.ts` — support only PMTiles vector, GeoJSON, and COG raster; `tilemapResource.ts` only needed for legacy

## GIS Data

- [ ] Get vector tileset with elevation label data from Isaac

## Tests

- [ ] Revisit existing Playwright tests — some may be better as vitest:browser tests (coord converters, visual style applicator)
- [ ] Write planned automated tests
