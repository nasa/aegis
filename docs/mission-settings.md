# Mission planet and elevation data

Missions store `planet: "earth" | "moon" | "mars"`. `src/utils/planets.ts` owns
the supported bodies, radii in metres, and map zoom limits. Use `getPlanetRadius`
for geometry and the planet identity for body-specific behavior. Adding a body
requires a code change; radius and LGRS are no longer editable mission settings.

`usesGridCoordinates` enables grid coordinates and grid-north bearings for Moon missions
and Earth missions without an uploaded grid, independently of lander location. The grid library provides global
lunar LGRS and Earth WGS84 UTM/UPS. Mars uses latitude/longitude and true-north bearings.

Moon missions always use a dynamic grid. Earth missions use an uploaded custom grid
when `serverFileGrid` is present and otherwise use a dynamic grid. Removing an uploaded
grid restores the dynamic Earth grid. Uploads are supported only for Earth; switching
bodies clears uploaded grid metadata. Grid mode and reference system are derived from
the planet and uploaded metadata, rather than stored or edited independently.

Earth missions store `earthGridLabelScheme` (`lunar-acc` by default, or `mgrs`). Users
can override coordinate labels in the map menu; exports use the mission default and
include canonical MGRS coordinates for located Earth items. Uploaded Earth grids keep
their custom coordinate labels and true-north bearings. Moon labels always use ACC.
Dynamic grids require a map projection that proj4 can parse. Calculated Sun/Earth
directions remain available only for Moon missions.

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
`gridSystem`, or `demResolution`. The GIS pipeline
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

Migration `20261107000000-derive-grid-system-from-planet` removes the stored grid-system
selection after the planet and grid-library migrations, preserves Earth label preferences,
and clears non-Earth uploaded-grid metadata. This supports databases with either branch's
migrations already applied, including Earth documents whose old radius has been removed.
Historical migration behavior is preserved.
