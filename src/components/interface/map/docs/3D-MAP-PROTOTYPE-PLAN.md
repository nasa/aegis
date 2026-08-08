# 3D Lunar Map Prototype Research and Implementation Plan

**Status:** Proposed / research complete  
**Date:** 2026-08-07  
**Initial testbed:** local mission 50  
**Primary decision:** Prototype a native CesiumJS implementation as the controlled product path.
The QuickMap companion and ACT integration work are specified separately in
[QUICKMAP-ACT-INTEGRATION-PLAN.md](QUICKMAP-ACT-INTEGRATION-PLAN.md). Do not start new work on
LithoSphere.

---

## 1. Executive Decision

AEGIS should pursue a controlled native CesiumJS path: add a lazy-loaded Cesium
renderer inside AEGIS, backed by mission 50's local DEM COG and the 10 m/px LOLA far-field
DEM. This costs more engineering, but gives AEGIS full control over mission data, camera
behavior, offline availability, Automerge edits, UI integration, scientific validation, and
release lifecycle. All prototype source belongs under `src/components/interface/map-3d/`,
with only a thin feature-flagged entry point touching the production application.

The native 3D map is a human-scale EVA situational-awareness view, not a planetary exploration
globe. The camera starts at an astronaut-scale observer and must never zoom or fly out far enough
to show the whole Moon.

LithoSphere is technically capable of rendering a curved lunar globe and AEGIS's south-polar
tile grid. It is not the recommended foundation. Its direct projected-tile support is attractive,
but it has a substantially older rendering stack, sparse tests, a continuous render loop with no
clear public destruction lifecycle, no direct monolithic COG terrain path, and much more custom
camera/lighting work. Cesium now has explicit custom-body and Moon support, including custom
ellipsoids, custom terrain providers, Moon-fixed transforms, terrain clamping, picking, and a
large maintained ecosystem.

---

## 2. Prototype Requirements

### 2.1 Required user experience

- Open a 3D view at mission 50's lander.
- Place the observer at a configurable eye height above the DEM, initially 2 m.
- Rotate heading through 360 degrees while the observer position remains fixed.
- Tilt from near-nadir to near-zenith without moving the observer.
- Keep navigation within the mission area and prevent every input, command, and camera flight
  from zooming out to a whole-Moon view.
- Show lunar curvature and a topographically valid horizon.
- Show catalog-derived stars in their correct apparent directions for the selected UTC.
- Show the Sun and Earth at the correct apparent directions for the selected UTC.
- Cast terrain shadows from the validated Sun direction, including the long shadows produced by
  very low solar elevations at the lunar south pole.
- Show AEGIS lander, stations, POIs, actions, traverses, walkbacks, measurements, and other
  relevant mission geometries on the terrain.
- Preserve selection and navigation into the existing AEGIS panes.
- In split-view mode, show the OpenLayers cursor position in 3D and the 3D cursor position in
  OpenLayers.
- Ultimately support create/move/edit workflows against the same Automerge mission document.
- Iterate behind a feature flag until accuracy, performance, accessibility, and browser support
  meet release criteria.

### 2.2 Scientific requirements

- Use the mission's configured lunar radius. Mission 50's pipeline profile uses a sphere with
  radius `1,737,400 m`.
- Keep longitude convention, latitude type, projection definition, elevation datum, no-data
  handling, and units explicit.
- Keep terrain vertical exaggeration at exactly 1 for all accuracy validation.
- Do not call a view "horizon accurate" until both local and far-field terrain are present and
  compared to an independent skyline calculation.
- Do not use Cesium's default Earth-fixed sky calculations as a lunar ephemeris oracle.
- Do not use random stars or Cesium's default Earth star-map texture as evidence of astronomical
  accuracy; star positions must have a named catalog, frame, epoch, and validation fixtures.
- Validate terrain shadows numerically at low solar elevations. A visually plausible hillshade
  or directional light is not proof of correct terrain occlusion.
- Record the ephemeris kernel/version or algorithm/version used to produce every result.

### 2.3 Initial non-goals

- Replacing OpenLayers.
- Providing a Google Earth-style planetary globe, orbital camera, or whole-Moon exploration.
- Editing every AEGIS entity type in the first terrain spike.
- Supporting every historical mission projection in the first iteration.
- Building a generic renderer abstraction before one 3D path works end to end.
- Reproducing external analysis tools inside AEGIS.
- Claiming photorealism, line-of-sight certification, or illumination certification from a visual
  prototype.

---

## 3. Relevant AEGIS Architecture

The current map is a good source of domain state but should not be used as the 3D renderer's
object model.

| Existing surface                   | Reuse in 3D              | Notes                                                            |
| ---------------------------------- | ------------------------ | ---------------------------------------------------------------- |
| `Mission` Automerge document       | Yes                      | Canonical lander/entity geometry and mission radius              |
| Redux selectors                    | Yes                      | UI selection, active EVA/REX, preset, folders, and display state |
| `getLayersToShow()`                | Yes                      | Pure preset/time/layer resolution independent of OpenLayers      |
| `useMapDateTime()`                 | Yes, after normalization | Current EVA type/time mismatch must be resolved                  |
| `useCoordConverters()`             | Math only                | 3D state remains canonical lat/lng; do not pass OL features      |
| OL `Feature`/`VectorSource`        | No                       | Renderer-specific mutable objects                                |
| Automerge `apply*`/`stage*`/thunks | Yes                      | All saves must retain one logical `.change()`                    |
| Existing `mapDirective` state      | Later                    | Add a Cesium interaction manager rather than emulating OL        |

Important current facts:

- [`MapProvider.tsx`](../MapProvider.tsx) registers the mission projection and centers the OL view
  on `mission.landerLocation`.
- [`AegisMapEditor.tsx`](../AegisMapEditor.tsx) composes independent headless behavior components.
  A 3D map should use the same composition idea, not a single giant component.
- [`getLayersToShow.ts`](../utils/getLayersToShow.ts) is already a pure layer-selection adapter
  and should feed both renderers.
- [`layerFactory.ts`](../utils/layers/layerFactory.ts) currently supports projected XYZ/TMS,
  GeoJSON, COG, and PMTiles MVT through OL-specific factories.
- [`MouseCoordinateDisplay.tsx`](../overlays/MouseCoordinateDisplay.tsx) keeps pointer state local.
  Split-view synchronization needs a renderer-neutral transient channel instead.
- [`map-sunearth.tsx`](../overlays/map-sunearth.tsx) displays preset-authored azimuths. It does not
  calculate ephemerides.
- [`mission.d.ts`](../../../../typings/mission.d.ts) already carries `landerLocation`,
  `landerElevationMeters`, `planetRadius`, `demFilePath`, `demResolution`, and all projection
  fields.

The mission page currently renders the map only when DB-backed mission layers exist. A 3D scene
must not be suppressed when a mission has a DEM but no visual layer records.

### 3.1 Prototype isolation boundary

The prototype must remain easy to remove, replace, or promote without destabilizing the existing
OpenLayers map:

- Put all prototype implementation source in `src/components/interface/map-3d/`, including
  Cesium setup, camera controls, terrain, imagery, celestial rendering, interactions, workers,
  adapters, and prototype-only utilities.
- Keep helpers in `map-3d/utils/` unless both the Cesium prototype and the production OpenLayers
  map actually use the same renderer-neutral behavior. Promote a helper to a shared location only
  after that shared contract exists.
- Do not place Cesium-specific types, lifecycle code, or coordinate objects in
  `src/components/interface/map/`.
- Limit production integration to a lazy import, feature flag or prototype route, and the minimum
  renderer-neutral state bridge. The current OL component tree must behave exactly as before when
  the flag is off.
- Keep Cesium dependencies out of the normal 2D startup graph. Construct and destroy all Cesium
  global overrides, workers, handlers, and caches within the 3D boundary.
- Tests may remain in the repository's established test directories, but their fixtures and
  helpers should mirror the `map-3d` ownership boundary.

---

## 4. Mission 50 and Data Assumptions

The checked-in south-pole pipeline profile supplies the following verified values:

| Field                 | Value                                                           |
| --------------------- | --------------------------------------------------------------- |
| Body                  | Spherical Moon                                                  |
| Radius                | `1,737,400 m`                                                   |
| Projection            | `IAU2000:30166`                                                 |
| PROJ string           | South polar stereographic, `lat_0=-90`, `lon_0=0`, `k=1`        |
| Cap bounds            | `[-931100, -931100, 931100, 931100] m`                          |
| Cap zoom-0 resolution | `12,800 m/px`                                                   |
| Local DEM             | 1 m/px Deflate COG, path supplied by `mission.demFilePath`      |
| Shared NAC basemap    | Projected TMS pyramid, zoom 0 through 13                        |
| Far field             | 10 m/px LOLA DEM covering the region south of 83 degrees        |
| LOLA DEM asset        | `LOLA_LDEM_83S_10MPP_ADJ_deflate_cog.tif` in mission 50 `Data/` |
| LOLA derivatives      | Hillshade, slope, contours, and other mission 50 map products   |

The API was reachable locally during research, but `/api/v1/all?missionId=50` required
authentication. Before implementation, capture a mission-50 inventory while logged in:

- Exact local DEM URL, dimensions, overview levels, no-data value, min/max elevation, and datum.
- Exact lander longitude/latitude/elevation and whether the stored elevation is authoritative.
- Default preset UUID and visible sublayers.
- Which visible rasters are COGs versus projected tile pyramids.
- Which PMTiles archives are needed in the first prototype.
- HTTP range behavior for every COG (`206`, `Accept-Ranges`, `Content-Range`).

The mission 50 Data folder already contains the adjusted, Deflate-compressed LOLA DEM COG
`LOLA_LDEM_83S_10MPP_ADJ_deflate_cog.tif`. It is an external mission-data input, not a source
asset tracked in this repository. The same Data folder also has LOLA-derived hillshade, slope,
contours, and related products. Inventory their exact filenames and metadata with the mission
before implementation.

The LOLA DEM is a requirement for horizon and shadow validation, not merely an enhancement. A
local DEM surrounded by a zero-height ellipsoid produces a false skyline and edge cliffs. Use the
hillshade, slope, and contour products as optional visualization and cross-check layers; they do
not replace elevation samples or dynamic Sun-driven shadows.

---

## 5. Research Findings

### 5.1 MMGIS

MMGIS now has a `GlobeRenderer` adapter for LithoSphere and Cesium. Useful patterns include:

- Lazy renderer selection behind one facade.
- `requestRenderMode` and explicit scene invalidation.
- One global Cesium click handler.
- `requestAnimationFrame` throttling for pointer coordinates.
- `CustomHeightmapTerrainProvider` with small downsampled grids.
- Renderer-neutral GeoJSON layer descriptors.
- Feedback-loop guards for 2D/3D view and selection synchronization.

Use MMGIS only as an architectural reference. AEGIS implementations must use AEGIS-specific
module, type, function, class, and variable names rather than carrying MMGIS identifiers into the
new code. This keeps ownership and provenance clear and avoids accidentally reproducing an
external internal API.

The MMGIS Cesium implementation is not a drop-in lunar solution for AEGIS. The inspected code
constructs a default Cesium `Viewer`, uses an Earth circumference for zoom conversion, and uses a
Web Mercator heightmap provider. Its projection object is separately configured, but that alone
does not change Cesium's globe ellipsoid. AEGIS must explicitly configure the Moon ellipsoid,
terrain provider, map projection, and central-body transform.

### 5.2 CesiumJS

Current CesiumJS directly supports the required foundations:

- `Ellipsoid.default` can be set to `Ellipsoid.MOON` or a mission-specific ellipsoid.
- `new Globe(ellipsoid)` renders a custom-size body.
- `CustomHeightmapTerrainProvider` accepts an explicit ellipsoid or tiling scheme.
- `CesiumTerrainProvider.fromUrl(..., { ellipsoid })` supports self-hosted heightmap or
  quantized-mesh terrain.
- `Camera.setView()` can change heading/pitch/roll without changing position.
- `Transforms.eastNorthUpToFixedFrame()` accepts an explicit ellipsoid.
- Terrain clamping, ground polylines, screen picking, scene depth testing, and custom directional
  lights are supported.
- `Transforms.computeIcrfToMoonFixedMatrix()` exists. Cesium documents replacing
  `Transforms.computeIcrfToCentralBodyFixedMatrix` with it for a Moon-centered scene.
- `Viewer.destroy()` and `requestRenderMode` provide manageable lifecycle and idle cost.

Cesium does not directly consume AEGIS's south-polar COG as terrain or correctly drape the
existing projected tile pyramid without reprojection. Those are adapter responsibilities.

Cesium's default sky still is not the scientific answer by itself. Its default central-body
transform is Earth-fixed until explicitly replaced. Its built-in Sun vector starts from an
Earth-centered planetary model, and the built-in Moon vector represents the Moon as viewed from
Earth. The native implementation should set a Moon-fixed transform for visualization and use
externally validated observer-to-Sun and observer-to-Earth vectors for acceptance.

### 5.3 LithoSphere

LithoSphere has genuine strengths for this data:

- Adjustable major/minor planetary radii.
- Proj4-aware custom projected tile grids.
- A checked-in lunar south-pole example.
- TMS/WMTS/WMS tile layers, tiled DEM parsing, clamped/vector GeoJSON, 3D Tiles, and models.
- Orbit and first-person controls.
- Link-control callbacks for 2D/3D cursor and center synchronization.

Its costs are material:

- The source package is built around TypeScript 3.9, Webpack 4, Three.js `>=0.122`, and older
  renderer idioms.
- The repository manifest reports 1.5.0 while current MMGIS requests `^1.6.0`; the package/source
  provenance must be reconciled before adoption.
- The public render loop continuously schedules `requestAnimationFrame` and exposes no obvious
  public destroy method.
- The test suite contains very little behavioral coverage.
- DEM input is tile-oriented. A monolithic COG still needs conversion or a custom parser plus a
  tile request scheme.
- The first-person control uses pointer lock and a built-in 3 m camera height. A fixed lander
  observer would need custom control work.
- Existing scene setup is ambient/basic-material oriented; accurate directional terrain
  lighting and shadows require renderer/shader changes.
- Zoom calculations contain Earth-scale constants even when radius scaling is applied.
- The south-pole example itself is labeled with possible issues.

LithoSphere is a useful reference implementation and a source of projection, tile-selection,
camera, and terrain-mesh lessons. It is reasonable to study those approaches and independently
rewrite the useful algorithms for AEGIS in modern strict TypeScript under `map-3d/`. Do not add
LithoSphere as a runtime dependency or transplant its legacy object model, identifiers, build
stack, or source wholesale. Any implementation materially adapted from source still requires the
appropriate license and attribution review. LithoSphere is not the preferred new dependency.

## 6. Native CesiumJS

### 6.1 Bootstrap and dependency boundaries

Add direct dependencies only after the first spike branch is approved:

- `cesium`
- `geotiff` (explicit direct dependency; do not rely on OL's transitive copy)
- A Vite static-copy solution for Cesium Workers, Assets, ThirdParty, and Widgets

Cesium must be lazy-loaded when the user first selects 3D so it does not inflate the normal 2D
startup path.

Vite requirements:

- Copy Cesium runtime directories to a stable build path.
- Define `CESIUM_BASE_URL` to that path before viewer construction.
- Import Cesium widget CSS once.
- Put Cesium/geotiff in dedicated chunks.
- Verify dev, production nginx, preview Docker, and source maps.
- Do not configure a Cesium ion token or make implicit ion requests.

### 6.2 Moon configuration

Use the mission radius rather than assuming a library constant:

```typescript
const radius = mission.planetRadius ?? 1_737_400;
const moon = new Ellipsoid(radius, radius, radius);

Ellipsoid.default = moon;
Transforms.computeIcrfToCentralBodyFixedMatrix = Transforms.computeIcrfToMoonFixedMatrix;

const terrainProvider = createMissionTerrainProvider(mission, moon);
const viewer = new Viewer(container, {
  globe: new Globe(moon),
  terrainProvider,
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  timeline: false,
  animation: false,
  infoBox: false,
  selectionIndicator: false,
  requestRenderMode: true,
  maximumRenderTimeChange: Number.POSITIVE_INFINITY,
});
```

At startup, assert that the scene map projection, globe, terrain tiling scheme, coordinate
factories, and all custom providers use equivalent lunar ellipsoids. A single WGS84 default left
in one path can produce a scene that looks plausible but has wrong scale, height, and horizon.

Disable Earth-specific visuals:

- Ground atmosphere and sky atmosphere.
- Built-in Moon billboard.
- Built-in Sun billboard until its direction is validated/replaced.
- Fog and water effects.
- Default imagery and terrain.

The scene must remain local even though Cesium renders an ellipsoid. Disable translation, zoom,
home, double-click flight, entity fly-to, and any automatic fit operation that could reveal the
whole globe. Permit heading, pitch, and a bounded field-of-view adjustment at the observer; add a
small, mission-scale relocation command only if the prototype later needs multiple EVA viewpoints.

### 6.3 COG-backed terrain prototype

`CustomHeightmapTerrainProvider` is the fastest route to mission 50 terrain.

For each requested Cesium geographic tile:

1. Get the tile's longitude/latitude rectangle from the provider tiling scheme.
2. Generate a small geographic sample grid, initially 32 x 32; benchmark 65 x 65.
3. Transform each sample from lon/lat into mission south-polar stereographic metres with proj4.
4. Compute one projected source bounding window for the grid.
5. Read that window from the best COG overview with geotiff.js range requests.
6. Bilinearly sample the non-linear projected points from the returned raster window.
7. Use the local 1 m DEM where valid.
8. Use `LOLA_LDEM_83S_10MPP_ADJ_deflate_cog.tif` outside the local DEM or where local no-data
   occurs.
9. Return a `Float32Array` of metre heights in Cesium's expected row order.
10. Cache completed and in-flight tiles in a bounded LRU.

Do this in a worker. Do not issue a `readRasters()` call per output pixel. Use geotiff.js's COG
range reads, internal overviews, worker decoder pool, bounding-window reads, bilinear resampling,
abort signals, and decoded-tile cache deliberately.

Special cases:

- The exact south pole is a longitude singularity.
- Geographic quadtree tiles converge strongly near the pole and can over-fetch.
- Longitude wrapping must not create a seam.
- Local and LOLA DEMs may have different no-data values, resolutions, and vertical datums.
- Blend only if both sources represent the same vertical reference; otherwise transform first.
- A local DEM edge must not become a vertical wall.
- Cesium request cancellation is less direct through `CustomHeightmapTerrainProvider`; cap work
  and discard stale results by generation ID.

### 6.4 Production terrain path

The direct COG provider is a prototype and scientific-reference path. Profile it before deciding
the production format.

Preferred production candidates:

1. Pre-generate a lunar geographic quantized-mesh pyramid with skirts and optional normals, then
   load it with `CesiumTerrainProvider.fromUrl(..., { ellipsoid: moon })`.
2. Pre-generate compact geographic heightmap tiles and retain a custom heightmap provider.

A live quantized-mesh architecture demonstrates that option 1 is technically sound.
AEGIS only needs terrain coverage for the south-pole mission area and every terrain caster that
can affect its horizon or shadows; it does not need a whole-Moon product. Do not build that
conversion pipeline until the COG prototype proves the projection, vertical datum, required
coverage, desired LOD, and visual acceptance criteria.

### 6.5 Raster imagery

Cesium cannot correctly drape AEGIS's south-polar TMS by passing its URL to
`UrlTemplateImageryProvider`; that provider expects tiles in its own geographic/Web Mercator
tiling scheme.

Prototype COG imagery adapter:

- Implement a custom imagery provider that produces each requested Cesium geographic image tile.
- Transform output pixel lon/lat to mission projected metres.
- Read the minimum COG window/overview.
- Resample/colorize in a worker and return `ImageBitmap` or canvas.
- Apply preset opacity/brightness/contrast/saturation through Cesium imagery properties when
  equivalent; document unsupported blend modes.

Projected tile-pyramid adapter:

- Determine source zoom from requested physical resolution.
- Transform the geographic output tile corners and sample grid into projected metres.
- Find and fetch all intersecting source tiles using mission origin, cap resolution, and TMS
  Y-flip rules.
- Mosaic and warp to the output tile.
- Share tile fetch/cache code with the COG imagery path where practical.

Long term, add Cesium-friendly geographic derivatives to the GIS pipeline for expensive shared
basemaps instead of reprojecting every browser session.

### 6.6 PMTiles vector tiles

There is no native Cesium MVT layer equivalent to the existing OL path.

Implementation order:

1. Render AEGIS's live mission entities directly.
2. Render ordinary GeoJSON sublayers.
3. Add PMTiles only after terrain, camera, imagery, and cursor sync are stable.

For PMTiles:

- Use the existing `pmtiles` archive client.
- Decode MVT with a maintained PBF/vector-tile decoder.
- Use embedded ESRI tile metadata to convert tile pixel coordinates to mission projected metres.
- Transform projected coordinates to lon/lat.
- Build batched Cesium ground primitives per visible tile.
- Cache by archive/tile/style revision and cancel out-of-view builds.
- Preserve feature IDs for picking.

### 6.7 Fixed lander camera

Do not rely on Cesium's default orbit behavior at a 2 m camera height. It is the source of much of
Cesium's perceived camera finickiness.

Implement a small `LanderCameraController`:

1. Sample the terrain at the lander.
2. Place the camera at DEM height plus eye height.
3. Disable Cesium translate, zoom, and collision-driven camera motion.
4. Convert pointer drag deltas to heading and pitch.
5. Wrap heading through 360 degrees.
6. Clamp pitch just short of straight down/up.
7. Call `camera.setView({ destination, orientation })` while keeping `destination` unchanged.
8. Use a 60-degree initial field of view; expose an explicit FOV control if needed.
9. Re-sample once the required terrain LOD is ready, then freeze the observer position unless the
   user requests a reset.
10. Disable camera input while a surface geometry is being dragged.
11. Reject camera destinations above a configured mission-scale ceiling and cancel built-in
    flights or fit commands that would expose the whole lunar body.

Acceptance invariant: Cartesian observer position changes by less than 1 mm while rotating a full
360 degrees, and no supported input path can escape the configured human-scale camera envelope.

### 6.8 Terrain picking and coordinates

For pointer coordinates:

1. Prefer `scene.pickPosition()` when supported and a depth position exists.
2. Otherwise intersect `camera.getPickRay()` with `scene.globe.pick()`.
3. Fall back to the lunar ellipsoid only when terrain is unavailable and mark altitude unknown.
4. Convert with the same explicit lunar ellipsoid.
5. Transform to `AEGISPoint` and optionally LGRS through existing domain utilities.

Throttle pointer work to one update per animation frame and suppress identical coordinates within
an epsilon.

### 6.9 Mission features and editing

Rendering order:

- Lander/stations/POIs/actions: billboards/points plus labels, clamped to terrain.
- Traverses/walkbacks/measurements/POS paths: ground polylines or explicitly sampled polylines.
- Selection/hover: renderer-local highlight primitives keyed by the same UUID.
- Labels: depth tested so terrain can occlude distant labels; selected labels may opt into a
  bounded depth-test override.

Do not convert OL features. Build renderer descriptors directly from mission snapshots and Redux
selectors.

Editing phases:

1. Read-only display and click selection.
2. Create markers from a picked surface point.
3. Draw/edit measurements.
4. Move POIs/stations/actions.
5. Edit traverses/walkbacks with the same endpoint pinning and save semantics as OL.

`CesiumInteractionManager` should consume the current renderer-neutral `mapDirective` intent and
call the same domain mutation helpers. Preview geometry remains local until the logical save;
Automerge still receives one atomic change.

---

## 7. Curvature and Horizon Accuracy

Both Cesium and LithoSphere can render a lunar-radius sphere. Curvature support alone does not
make the skyline correct; terrain coverage and LOD do.

For a smooth sphere, observer height $h$ and radius $R$ give geometric horizon distance:

$$
d = \sqrt{(R+h)^2 - R^2} = \sqrt{2Rh+h^2}
$$

At $R=1{,}737{,}400\ \text{m}$ and $h=2\ \text{m}$, $d$ is about $2.64\ \text{km}$. Lunar
topography can move the visible skyline much farther away, especially near high terrain. This is
why the 10 m/px LOLA far field is required even though the nominal smooth-sphere horizon is close.

### Independent skyline oracle

Build an offline validator from the same source DEMs, not from Cesium's rendered mesh:

1. For each azimuth at 0.25- or 0.5-degree spacing, sample a radial terrain profile.
2. Convert every sample and the observer to Moon-centered Cartesian coordinates.
3. Compute the elevation angle from the observer's local ENU frame.
4. Record the maximum elevation angle and responsible distance.
5. Compare the predicted skyline to rendered pixel rays for fixed camera fixtures.
6. Compare Sun visibility against the skyline at the Sun azimuth.

Initial acceptance targets:

- Terrain sample height agrees with GDAL/API control samples within one source vertical pixel or
  an explicitly tighter mission tolerance.
- Horizon angle agrees with the independent oracle within 0.25 degrees or one rendered pixel,
  whichever is larger.
- No visible local/far-field seam or zero-height wall.
- Results are stable as terrain LOD settles.

---

## 8. Stars, Sun, Earth, and Shadows

### 8.1 Source of truth

Use NAIF SPICE as the scientific source of truth.

Astronomy Engine is maintained and useful for Earth-centered vectors and sanity checks, but its
public observer/horizon APIs are Earth-surface-centric. Its lunar libration output is not a full
Moon-fixed topocentric observer solution.

No credible maintained browser/Node NAIF SPICE package was identified during research. The
safest prototype is therefore:

1. Use `spiceypy`/CSPICE in an offline generation step.
2. Load an LSK, planetary SPK, lunar orientation PCK, and lunar frame kernel whose versions are
   committed to the generated metadata.
3. Generate observer-to-Sun and observer-to-Earth unit vectors for mission 50's lander over the
   required mission interval, initially at 60-second cadence.
4. Express vectors in the agreed Moon-fixed frame and include apparent angular diameter/distance.
5. Store a compact JSON/typed-binary ephemeris product with UTC bounds and kernel provenance.
6. Interpolate normalized vectors in the client and compare random samples to direct SPICE output.

Long term, choose between a maintained internal ephemeris service, a supported CSPICE WASM build,
or generated mission products. Do not add an unmaintained third-party WASM binding just to avoid
this decision.

### 8.2 Coordinate contract

Explicitly settle:

- `IAU_MOON` versus the principal-axis/mean-Earth frame used by source products.
- East-positive longitude.
- Planetocentric versus planetographic latitude (identical for the configured sphere, but still
  name it).
- Observer height reference.
- Light-time and stellar-aberration correction policy.
- UTC/leap-second handling.

Convert Moon-fixed vectors into the observer's ENU frame. Report azimuth as degrees clockwise
from local north and elevation as degrees above the local tangent plane.

### 8.3 Rendering

- Set Cesium clock to the selected AEGIS UTC for consistency.
- Explicitly set the central-body transform to `computeIcrfToMoonFixedMatrix`.
- Drive `scene.light` with a custom `DirectionalLight` from the validated Sun direction.
- Enable terrain lighting with usable terrain normals and explicitly configure terrain to cast
  and receive shadows.
- Show Sun/Earth disks in a sky overlay or world-space billboard sized by apparent angular
  diameter.
- Hide or clip a body when it is below the topographic skyline, not merely below the tangent
  plane.
- Never substitute the static LOLA hillshade for dynamic illumination. It is a useful comparison
  layer, not the shadow result.

Any external renderer used for comparison must provide stated ephemeris/frame/terrain provenance;
validate the same fixtures rather than assuming visual agreement is sufficient.

### 8.4 Accurate star field

Cesium's `SkyBox` accepts a custom cubemap, but its default Earth star map is not a documented,
time-dependent astronomical catalog. The preferred prototype is a small catalog renderer rather
than an unverified decorative cubemap:

1. Preprocess a magnitude-limited Hipparcos, Tycho-2, or Gaia subset into ICRF unit vectors,
   magnitudes, colors, catalog IDs, epoch, and optional proper motion.
2. Render stars as batched point sprites in an inertial frame, or generate a catalog-derived
   cubemap only after proving its orientation remains fixed in that frame.
3. At the selected UTC, transform the camera between Moon-fixed and inertial frames with the same
   validated frame chain used for the Sun and Earth.
4. Occlude stars behind terrain and the Moon; do not draw them through the local horizon.
5. Validate known bright stars against reference azimuth/elevation fixtures at the mission 50
   lander.

The Moon has no atmospheric extinction, but a display cannot simultaneously reproduce the true
exposure of bright sunlit terrain and make faint stars obvious on a normal monitor. Keep star
directions and relative magnitudes accurate while allowing a clearly labeled visibility gain or
magnitude cutoff for situational awareness. Do not describe that display gain as photometric
accuracy.

### 8.5 Low-angle terrain shadows

South-pole solar elevations make distant terrain important. A terrain feature of height $h$
casts an idealized horizontal shadow of approximately

$$
L = \frac{h}{\tan(e)}
$$

where $e$ is solar elevation. At $e=1$ degree, a 100 m relief feature can cast a shadow about
5.7 km long; at 0.5 degrees, about 11.5 km. The terrain provider, shadow caster bounds, and LOD
must cover these distances for the selected mission times.

Cesium's documented globe shadows only cast from terrain currently in view, so enabling
`globe.enableLighting` and terrain shadows is necessary but not sufficient. The prototype must
compare Cesium's result against an independent DEM ray/horizon calculation at representative
low-Sun UTCs. If offscreen terrain or shadow-map precision causes disagreement, either expand the
caster coverage or render a validated DEM-derived illumination mask. Shadow acceptance must
include self-shadowing, distant ridge occlusion, local/far-field seams, and stability while LOD
settles.

---

## 9. OpenLayers and 3D Synchronization

### 9.1 Native split view

Add `2D`, `3D`, and `Split` modes above the renderer components. In split mode, use a resizable
CSS grid in the existing central map surface. This is an in-app pane, not a browser popup.

Create a transient renderer-neutral bridge outside Redux:

```typescript
interface SurfacePointerEvent {
  source: "openlayers" | "cesium";
  point: AEGISPoint | null;
  sequence: number;
}

interface SurfaceViewEvent {
  source: "openlayers" | "cesium";
  center: AEGISPoint;
  heading?: number;
  pitch?: number;
  metresPerPixel?: number;
  sequence: number;
}
```

Use an external store/event emitter with `useSyncExternalStore`, not 60 Hz Redux actions.

OpenLayers -> Cesium cursor flow:

1. OL `pointermove` obtains projected coordinate.
2. Existing converters produce `AEGISPoint`.
3. Publish once per animation frame.
4. Cesium samples/uses terrain height and moves one transient cursor primitive.
5. Hide it when the pointer leaves OL.

Cesium -> OpenLayers is symmetric, using a private OL source so it does not mutate shared mission
feature sources.

Use source tokens/sequence numbers to prevent feedback loops. Fixed lander mode should not pan
because the 2D map pans; provide explicit "Center 2D here" and "Show this point in 3D" commands.

---

## 10. Proposed File Structure

All prototype implementation source is owned by one sibling tree. `map-3d` is intentional; do
not split it between `interface/map/`, generic `components/utils/`, and unrelated stores while the
design is still experimental.

Native Cesium path:

```text
src/components/interface/map-3d/
  AegisMap3D.tsx
  CesiumProvider.tsx
  MapViewModeControl.tsx
  MapViewSyncProvider.tsx
  prototype/
    Map3DPrototypeRoute.tsx
  camera/
    LanderCameraController.ts
  terrain/
    createMissionTerrainProvider.ts
    CogTerrainSampler.ts
    cogTerrain.worker.ts
  imagery/
    AegisCogImageryProvider.ts
    AegisProjectedTileImageryProvider.ts
  layers/
    CesiumTileLayers.tsx
    CesiumMissionFeatures.tsx
    CesiumGeoJsonLayers.tsx
    CesiumPmtilesLayers.tsx
  interactions/
    CesiumInteractionManager.tsx
  celestial/
    EphemerisOverlay.tsx
    ephemerisInterpolation.ts
  stars/
    StarCatalog.ts
    StarField.tsx
  lighting/
    LunarTerrainLighting.tsx
    shadowValidation.ts
  utils/
    moonCoordinates.ts
    terrainPicking.ts
```

Keep this as a sibling of the OL map implementation. Shared code should be domain descriptors,
selectors, and coordinate math, not renderer objects. Utilities stay in `map-3d/utils/` until an
existing OL caller also needs them. The initial route or flag should lazy-load this entire tree;
turning the prototype off must leave the production map bundle and behavior unchanged.

---

## 11. Implementation Phases

### Phase C0: Cesium Moon bootstrap

- Add lazy Cesium bundle/static assets.
- Construct only a lunar ellipsoid, empty globe, and test pattern.
- Prove no ion/Earth network requests.
- Add fixed lander camera on synthetic flat terrain.
- Enforce the human-scale camera envelope and prove no input can reveal the whole globe.
- Add deterministic destroy/recreate and resize behavior.

Exit: rotate 360 degrees at a fixed 2 m observer on the correct-radius Moon.

### Phase C1: Mission 50 terrain

- Add explicit geotiff dependency and worker.
- Load mission DEM COG by range.
- Add `LOLA_LDEM_83S_10MPP_ADJ_deflate_cog.tif` as the LOLA fallback COG.
- Inventory and display the LOLA hillshade, slope, and contour derivatives as optional layers.
- Handle projection, no-data, overview, seam, and cache behavior.
- Validate height, horizon, and low-angle terrain-occlusion fixtures.

Exit: scientifically defensible terrain and skyline at the lander.

### Phase C2: Imagery and mission features

- Add one COG imagery layer and one projected TMS layer.
- Reuse `getLayersToShow()` and preset opacity/order.
- Add lander, station, POI, action, traverse, walkback, and measurement display.
- Add selection/navigation and terrain-aware picking.

Exit: selected mission plan is readable in 3D over mission imagery.

### Phase C3: Split view and celestial geometry

- Add `2D`/`3D`/`Split` control and resize handling.
- Add bidirectional transient cursor bridge.
- Add normalized map time contract.
- Generate/load SPICE ephemeris fixture.
- Render a catalog-derived inertial star field.
- Render Sun/Earth, drive custom terrain light, and validate terrain shadows at low Sun angles.

Exit: cursor and time are coherent across views; star, Sun, Earth, and shadow fixtures pass.

### Phase C4: Editing

- Select entities in 3D.
- Create and move markers.
- Draw/edit measurements.
- Edit traverse/walkback geometry with endpoint rules.
- Preserve one-change Automerge operations and cancel semantics.

Exit: scoped 3D edits round-trip to 2D and another Automerge peer.

### Phase C5: Production hardening

- Profile direct COG terrain and choose production terrain format.
- Add PMTiles only if required by release presets.
- Add accessibility/keyboard/touch behavior.
- Add context loss, low-memory, network failure, and unsupported-browser states.
- Add release feature flag, diagnostics, and user-visible data provenance.

Exit: release checklist and measured performance budgets pass on target hardware.

---

## 12. Validation Plan

### 12.1 Unit tests

- Lunar ellipsoid radius equality across providers.
- Lon/lat <-> Moon Cartesian control points, including the south pole and date line.
- Cesium tile rectangle -> mission projected sample grid.
- COG window selection, overview selection, bilinear sample, and no-data fallback.
- Local DEM/LOLA precedence and edge handling.
- Lander ENU heading/pitch vectors.
- Fixed-camera position invariant.
- Human-scale camera bounds and rejection of whole-globe flights.
- Ephemeris interpolation and azimuth/elevation conversion.
- Star catalog frame/epoch conversion and known-star azimuth/elevation.
- Low-angle DEM shadow-ray fixtures and caster-distance calculations.
- Cursor bridge feedback-loop suppression.

### 12.2 Browser/component tests

- Lazy-load and initialize Cesium only when requested.
- Resize after panes and split divider move.
- Destroy viewer, workers, handlers, caches, and observers on unmount.
- Restore scene after WebGL context loss if supported.
- Render mission features and update without leaking stale primitives.
- Keep the star field inertially stable while the Moon-fixed camera time changes.
- Request a new frame after celestial or shadow state changes.
- Use request-render mode and request a frame after every state change.

### 12.3 E2E tests

- Mission 50 switches between 2D, 3D, and split without changing mission selection.
- A known OL cursor point appears at the same lunar coordinate in Cesium.
- Camera position remains fixed through full heading rotation.
- Every camera control remains inside the configured mission-scale envelope.
- Known stars, Sun, and Earth appear in the expected direction at a fixture UTC.
- A low-Sun terrain shadow agrees with the DEM-derived fixture after terrain LOD settles.
- Click selection opens the same AEGIS pane from either renderer.
- No request reaches Cesium ion or an Earth imagery/terrain service.
- A feature edited in 3D appears in 2D after one Automerge change.

### 12.4 Scientific fixtures

- GDAL-derived terrain control points.
- Independent radial skyline profiles.
- Catalog star directions and SPICE Sun/Earth vectors at representative mission UTCs.
- DEM-derived low-angle shadow masks or ray tests.
- Screenshots with known FOV/heading/pitch only as secondary evidence; numeric comparisons are
  authoritative.

### 12.5 Initial performance budgets

Measure before finalizing budgets. Starting targets for a supported desktop browser:

- Useful terrain visible within 5 seconds on the operational network.
- At least 30 FPS while rotating after required terrain is resident.
- No long task over 100 ms during steady camera movement.
- Bounded terrain/imagery cache with no monotonic growth after repeated rotations.
- Idle native 3D view uses request-render mode.
- 2D startup bundle and time-to-interactive are unchanged until 3D is opened.

---

## 13. Risks and Mitigations

| Risk                                   | Impact                           | Mitigation                                                     |
| -------------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Wrong Cesium ellipsoid in one API      | Plausible but incorrect geometry | Explicit ellipsoid everywhere plus startup assertions/tests    |
| Polar geographic quadtree inefficiency | Excess requests/GPU load         | COG spike, profile, then pre-generate terrain                  |
| DEM datum mismatch                     | False heights/horizon cliffs     | Metadata gate and explicit transform before blending           |
| Local DEM ends before skyline          | False horizon                    | LOLA fallback required for horizon milestone                   |
| COG range/CORS failure                 | Full downloads or blank terrain  | Same-origin proxy, header tests, fail visibly                  |
| Camera collision changes observer      | Invalid lander viewpoint         | Custom controller and fixed-position invariant                 |
| Default Cesium sky is Earth-centric    | Wrong Sun/Earth                  | Moon-fixed transform plus SPICE-derived custom vectors         |
| Decorative/default star map            | Wrong or unverifiable star field | Catalog-derived ICRF renderer with known-star fixtures         |
| Offscreen terrain does not cast        | Wrong low-Sun shadows            | DEM ray oracle, required caster coverage, or illumination mask |
| Prototype leaks into production map    | OL regressions and bundle growth | Isolated `map-3d` tree, lazy flag/route, local utilities       |
| Cesium bundle size                     | Slower normal app                | Lazy chunk and copied runtime assets                           |
| PMTiles conversion scope               | Delays core prototype            | Defer until terrain/entity/imagery path is proven              |
| Two editable renderers diverge         | Data corruption/confusing UX     | Shared domain operations, one active interaction, atomic saves |

---

## 14. Open Questions Before Implementation

### Mission/GIS

- What is the exact vertical datum of the local DEM and LOLA far field?
- Does the local DEM overlap LOLA enough for seam validation?
- Is the LOLA COG tiled with internal overviews and browser-supported compression?
- What are the exact filenames, projections, and style conventions for the mission 50 LOLA
  hillshade, slope, contour, and related products?
- Which mission-50 raster must appear first beyond terrain?
- Which PMTiles layer is release-critical?
- What terrain/horizon/angular error is operationally acceptable?

### Product

- Is the first 3D view read-only?
- Is the desired UI a split pane, mode switch, popup, or all three?
- Should the observer be exactly at the lander or selectable among stations/POIs?
- Is the eye height fixed, mission-configured, or user-configurable?
- Which UTC source wins when preset preview, EVA, REX, and sequence time disagree?
- Which star catalog, limiting magnitude, proper-motion policy, and display gain are acceptable?
- What camera distance/height envelope defines "human scale" for stations away from the lander?

---

## 15. Recommendation Summary

1. Run the narrow Cesium C0/C1 technical spikes. They directly answer the highest
   native risks: custom Moon setup, fixed 2 m camera, polar COG sampling, LOLA fallback, and
   horizon accuracy.
2. Do not adopt LithoSphere as a dependency. Its source can inform an independent modern
   TypeScript rewrite of useful projection, tiling, camera, or mesh techniques inside `map-3d/`.

The native path keeps the renderer, mission data, and release lifecycle under AEGIS control.

---

## 16. External References

- [MMGIS](https://github.com/NASA-AMMOS/MMGIS)
- [MMGIS `GlobeRenderer`](https://github.com/NASA-AMMOS/MMGIS/blob/development/src/essence/Basics/Globe_/GlobeRenderer.js)
- [LithoSphere](https://github.com/NASA-AMMOS/LithoSphere)
- [LithoSphere lunar south-pole example](https://github.com/NASA-AMMOS/LithoSphere/blob/master/public/examples/exampleProj.html)
- [CesiumJS custom Moon example](https://github.com/CesiumGS/cesium/blob/main/packages/sandcastle/gallery/moon/main.js)
- [CesiumJS `Globe`](https://cesium.com/learn/cesiumjs/ref-doc/Globe.html)
- [CesiumJS `CustomHeightmapTerrainProvider`](https://cesium.com/learn/cesiumjs/ref-doc/CustomHeightmapTerrainProvider.html)
- [CesiumJS camera](https://cesium.com/learn/cesiumjs/ref-doc/Camera.html)
- [CesiumJS `SkyBox`](https://cesium.com/learn/cesiumjs/ref-doc/SkyBox.html)
- [CesiumJS `Globe` shadows](https://cesium.com/learn/cesiumjs/ref-doc/Globe.html)
- [GeoTIFF.js](https://github.com/geotiffjs/geotiff.js)
- [Astronomy Engine](https://github.com/cosinekitty/astronomy)
- [NAIF SPICE](https://naif.jpl.nasa.gov/naif/)
