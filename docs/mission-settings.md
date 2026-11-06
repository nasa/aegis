# Mission planet and elevation data

Missions store `planet: "earth" | "moon" | "mars"`. `src/utils/planets.ts` owns
the supported bodies, radii in metres, and map zoom limits. Use `getPlanetRadius`
for geometry and the planet identity for body-specific behavior. Adding a body
requires a code change; radius and LGRS are no longer editable mission settings.

`usesLgrsCoordinates` enables the current lunar south-pole coordinate implementation
when the lander latitude is strictly south of 80°S on the Moon. These missions always
use dynamic LGRS, including through coordinate conversion for other map projections.
Manual grid uploads are supported only for Earth missions that need a grid. Moon
missions outside the supported LGRS region and Mars missions have no grid; they do
not fall back to uploaded grids. Existing uploaded grids are ignored for all non-Earth
missions, and switching an Earth mission to another body clears its uploaded grid
metadata. Grid mode is derived, not stored or editable. Calculated Sun/Earth directions
remain available only for Moon missions.

Earth grid uploads use a GeoJSON Point feature collection with `name`, `row_total`,
and `column_total` at the top level and `id`, `row`, and `column` on each point.
Point labels can use `properties.name`; existing `L_coord`/`R_coord` labels remain
supported. No lunar LGRS field is required.

Lander elevation starts as `null` and is read-only in the admin interface. The server
automatically samples it when a DEM or the lander location changes, clearing the old
value while sampling. Missing DEMs, invalid locations, NoData cells, and sampling
failures leave elevation unknown. Valid elevations of zero and negative elevations
are preserved. The UI encourages adding a DEM to determine elevation. Lander xgress
station elevations follow the same derived value; stale sample results are discarded.

The admin DEM picker discovers `.tif` and `.tiff` files recursively under the
mission's `Data/` folder. It reads the primary GeoTIFF image's metadata without
decoding pixels. Files must be georeferenced single-band elevation rasters in a
supported projected CRS, with horizontal and vertical units in metres. Rotated
transforms and geographic degree grids are unsupported by the existing sampler.
For rectangular cells, sampling uses the smaller of the two pixel dimensions.
Invalid files remain visible with an explanation and cannot be selected.

`GET /api/v1/missionAutomerge/dems?missionId=42` returns selection metadata to
authorized mission editors. `POST /api/v1/missionAutomerge/fields` accepts `planet`
and `demFilePath`. Setting the DEM path validates the file on the server and saves
its detected `demResolution` in the same Automerge change; an empty path clears
both values. The path includes `Data/` automatically in the picker. Clients must
not send `planetRadius`, `usingLGRSCoordinates`, `gridRenderMode`, `landerElevationMeters`,
or `demResolution`. The GIS pipeline
uses this API, so the DEM must already exist on the AEGIS server before registration.

Changing a planet recalculates stored traverse and station walkback distances,
which also invalidates affected terrain profiles through their input signatures.
It does not reproject uploaded GIS data or change a custom projection definition.

Deploy with the normal `npm run migration:up` workflow. Migration
`20261105000000-select-mission-planet` converts historical Moon, Earth (including
mean-radius Earth), and Mars radii, removes the old fields, and recalculates saved
distances. Unknown historical radii stop migration with an explicit error so an
unsupported body cannot silently become the Moon. Existing DEM selections and
their resolution remain intact until a DEM is selected again.
