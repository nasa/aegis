# Newton REST API

Base URL: `https://jsxim-gisproc1.ndc.nasa.gov`

Note:

- `Content-Type` is `application/json` for all request and response bodies
- CORS is enabled with `Access-Control-Allow-Origin: *`

## Error model

All errors are returned like so:

```json
{
  "error": {
    "code": "validation_error",
    "message": "human readable",
    "details": []
  }
}
```

## `/api/v1`

| Method | Endpoint         | Request body | Success                                                | Errors | Description                                                                                                             |
| ------ | ---------------- | ------------ | ------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/health` | —            | `200 {"status":"ok", "sha": string, "map_count": int}` | `500`  | Health check. `sha` is the short git sha of the running code (`"unknown"` outside a git checkout, e.g. in a container). |
| `GET`  | `/api/v1/jobs`   | —            | `200 {"jobs": Job[]}`                                  | `500`  | List all background jobs (traverses, profiles), newest first. Summary rows only — no `request`/`result` payloads.       |

### `/api/v1/traverses`

Anything related to understanding how to get from point A to point B.

| Method   | Endpoint                                  | Request body                                                                  | Success                                                                                                                                                                                                                                      | Errors                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | ----------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/traverses`                       | `TraverseProblem`                                                             | `202 {"traverse_id": "some-uuid", "request_hash": "v1:…"}` (adds `"cached": true` when a prior identical result is reused)                                                                                                                   | `400`, `413`, `422`, `500`, `503` | Plan a new traverse. Works asynchronously by returning a queryable `traverse_id`. `503` when an obstacle map it would use changed since `bin/prepare-maps.jl` reprojected it (re-run it). If an identical request (same normalized `TraverseProblem` + same, unchanged maps) already succeeded, its `traverse_id` is returned immediately with `"cached": true`. The planner (`method`), the `vehicle` (for `"turning_radius"` only) and `subpixel_hazard_penalty` (omitted = `0`) are part of the match. Buffers are normalized to meters on the selected map, so the deprecated `slope_buffer: 2` on a 5 m map and `slope_buffer_m: 10.0` share an entry. Registering an overlapping obstacle map, or changing a map's configured `buffer_m`, starts a new entry.                                               |
| `GET`    | `/api/v1/traverses/:traverse_id`          | —                                                                             | `200 {"traverse_problem": TraverseProblem, "method": string, "request_hash": string \| null, "effective_problem": object \| null, "status": WorkStatus, "runtime": int \| null, "path": Path, "map_info": list of MapInfo, "error": string}` | `404`, `500`                      | Query for information about a traverse. `method` is the effective planner (`"astar"` or `"turning_radius"`), filled in even when the request omitted it. `request_hash` and `effective_problem` are described under [Request hash](#request-hash); both are `null` for traverses planned before they existed. Poll `status` until it reaches a terminal state. A traverse yields exactly one `path` (null until succeeded). `runtime` is the wall-clock job duration in milliseconds, or null until the job reaches a terminal state. `map_info` is the list of `MapInfo` structs for the maps used to plan the traverse: the slope map and every obstacle map (empty until maps are resolved). `error` is present only when `status` is `failed`, and says why (e.g. a waypoint inside an obstacle, or no path). |
| `DELETE` | `/api/v1/traverses/:traverse_id`          | —                                                                             | `202 {"status": "cancelled"}`                                                                                                                                                                                                                | `404`, `409`, `500`               | Cancel an in-progress traverse. Planning stops at its next check: between waypoint legs and between refined windows, not inside one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `GET`    | `/api/v1/traverses/maps`                  | query: `?type=obstacle` (optional filter)                                     | `200 {"maps": MapInfo[], "next_cursor": string \| null}`                                                                                                                                                                                     | `400`, `500`                      | List available maps, optionally filtered by `type` and/or `planet`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/v1/traverses/maps/probe`            | query: `?planet=&lon=&lat=` **or** `?planet=&extent=minX,minY,maxX,maxY&crs=` | `200 {"maps": MapInfo[]}`                                                                                                                                                                                                                    | `400`, `422`, `500`               | List maps available at a location or over an extent. When using `extent`, returns all maps that cover any part of the region.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/v1/traverses/:traverse_id/profiles` | `{"profiles": list of profile options}`                                       | `202 {"profile_id": "some-uuid"}`                                                                                                                                                                                                            | `400`, `404`, `413`, `422`, `500` | Profile an existing traverse. Works asynchronously by returning a queryable `profile_id`. **⚠️ Not yet implemented:** the job is accepted and validated (unknown traverse → 404, unknown option → 400), but the work is a placeholder — the resulting profile's `profiles` is always `null` and `map_info` is `[]`. It does not yet fetch the referenced traverse's planned path or sample maps. Use `POST /api/v1/traverses/profiles` (arbitrary path) for real profiling in the meantime. See [docs/plan.md](plan.md) §4.                                                                                                                                                                                                                                                                                       |
| `POST`   | `/api/v1/traverses/profiles`              | `{"planet": Planet, "path": Path, "profiles": list of profile options}`       | `202 {"profile_id": "some-uuid"}`                                                                                                                                                                                                            | `400`, `413`, `422`, `500`        | Profile an arbitrary path. `path` is a GeoJSON `LineString`; each map is chosen independently as the highest-resolution registered map that covers the path. Works asynchronously by returning a queryable `profile_id`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GET`    | `/api/v1/traverses/profiles/:profile_id`  | —                                                                             | `200 {"status": WorkStatus, "runtime": int \| null, "profiles": Profile, "map_info": list of MapInfo}`                                                                                                                                       | `404`, `500`                      | Returns a `Profile` GeoJSON where each selected profile option is a property. `runtime` is the wall-clock job duration in milliseconds, or null until the job reaches a terminal state. `map_info` is the list of `MapInfo` structs for the maps sampled to build the profile (empty until maps are resolved).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

#### Traverse Profiles

A profile is a list of derived values for each point in a traverse. In GeoJSON, the traverse is a LineString and a profile is a property array of the same length.

Profile options:

- `elevation`: elevation (m)
- `elevation_change`: elevation change so far
- `slope`: slope (degrees)
- `slope_aspect`: slope aspect (degrees angle of slope where `0` is N and it increases clockwise)
- `tri`: terrain ruggedness index (TRI)
- `distance`: distance traveled so far (m)
- `distance_remaining`: distance remaining (m)
- `radial_distance`: radial (straight line) distance from start (m)
- `dir_travel`: direction of travel

#### Trying it out with `curl`

Start the server (it loads maps from a config file; `config-local.toml` points at
real lunar GeoTIFFs on disk):

```sh
./bin/run-server.jl --port 8080 --config-path config-local.toml
```

> The planner is CPU-bound and runs on a background thread. `bin/run-server.jl`
> starts Julia with `--threads=auto` so long A\* jobs don't block request
> handling; keep that flag if you launch the server another way.

On Mac, `curl` with: `CURL_SSL_BACKEND=secure-transport curl ...`

**Health check** — how many maps loaded:

```sh
curl -s http://localhost:8080/api/v1/health
# {"status":"ok","sha":"90ed886","map_count":5}
```

**List background jobs** (traverses + profiles), newest first:

```sh
curl -s http://localhost:8080/api/v1/jobs
# {"jobs":[{"id":"<uuid>","kind":"traverse","status":"succeeded",
#           "cancel_requested":false,"created_at":"2026-01-02T03:04:05.678",
#           "updated_at":"2026-01-02T03:04:07.890"}, ...]}
```

**List available maps** (optionally filter by `type` / `planet`):

```sh
curl -s "http://localhost:8080/api/v1/traverses/maps"
curl -s "http://localhost:8080/api/v1/traverses/maps?type=slope&planet=moon"
```

**Probe which maps cover a point** (geodetic LonLat):

```sh
curl -s "http://localhost:8080/api/v1/traverses/maps/probe?planet=moon&lon=-80.0&lat=-89.0"
```

**Plan a traverse** (async). The request body is a `TraverseProblem`. The two
`waypoints` below lie inside the `cr_g2` lunar slope map:

```sh
curl -s -X POST http://localhost:8080/api/v1/traverses \
  -H 'Content-Type: application/json' \
  -d '{
    "planet": "moon",
    "waypoints": [
      [-78.20410294885197, -88.99557815279256],
      [-83.10177197680329, -89.10860350500529]
    ],
    "slope_limit": 20.0
  }'
# {"traverse_id":"<uuid>","request_hash":"v1:<sha256 hex>"}
```

**Plan the same traverse with a stricter slope limit.** Lowering `slope_limit`
marks more terrain as impassable, so the planner routes around steeper ground
(or returns no path if the tighter limit cuts off every route). When
`slope_limit` is omitted it falls back to the server default (`defaults.slope_limit`
in `config.toml`):

```sh
curl -s -X POST http://localhost:8080/api/v1/traverses \
  -H 'Content-Type: application/json' \
  -d '{
    "planet": "moon",
    "waypoints": [
      [-78.20410294885197, -88.99557815279256],
      [-83.10177197680329, -89.10860350500529]
    ],
    "slope_limit": 10.0
  }'
# {"traverse_id":"<uuid>"}
```

**Poll the traverse** until `status` is `succeeded` (then `path` is a GeoJSON
`LineString`):

```sh
curl -s http://localhost:8080/api/v1/traverses/<uuid>
# {"traverse_problem":{...},"method":"astar","request_hash":"v1:...","effective_problem":{...},
#  "status":"in_progress","runtime":null,"path":null,"map_info":[]}
# ... later ...
# {"traverse_problem":{...},"method":"astar","request_hash":"v1:...","effective_problem":{...},
#  "status":"succeeded","runtime":1234,
#  "path":{"type":"LineString","coordinates":[[lon,lat],...]},
#  "map_info":[{"planet":"moon","type":"slope","name":"...",...}]}
```

**Plan a turning-radius aware traverse.** Set `method` to `"turning_radius"` and
describe the vehicle. Exactly two waypoints (start and goal) are allowed for
this method:

```sh
curl -s -X POST http://localhost:8080/api/v1/traverses \
  -H 'Content-Type: application/json' \
  -d '{
    "planet": "moon",
    "waypoints": [
      [-78.20410294885197, -88.99557815279256],
      [-83.10177197680329, -89.10860350500529]
    ],
    "slope_limit": 20.0,
    "method": "turning_radius",
    "vehicle": {
      "max_turn_angle": 30.0,
      "turning_increments": 5.0,
      "step_distance": 5.0
    }
  }'
# {"traverse_id":"<uuid>"}
```

**Cancel an in-progress traverse**:

```sh
curl -s -X DELETE http://localhost:8080/api/v1/traverses/<uuid>
# {"status":"cancelled"}
```

**Profile an arbitrary path** (async). The body is GeoJSON: a `LineString` under
`path` plus the `profiles` to compute:

```sh
curl -s -X POST http://localhost:8080/api/v1/traverses/profiles \
  -H 'Content-Type: application/json' \
  -d '{
    "planet": "moon",
    "path": {
      "type": "LineString",
      "coordinates": [
        [-78.20410294885197, -88.99557815279256],
        [-83.10177197680329, -89.10860350500529]
      ]
    },
    "profiles": ["slope", "elevation", "distance"]
  }'
# {"profile_id":"<uuid>"}
```

**Poll the profile** until `status` is `succeeded` (then `profiles` is a GeoJSON
`Feature` with one property array per requested option):

```sh
curl -s http://localhost:8080/api/v1/traverses/profiles/<uuid>
# {"status":"succeeded","runtime":1234,"map_info":[{"planet":"moon","type":"slope",...}],
#  "profiles":{"type":"Feature",
#  "geometry":{"type":"LineString","coordinates":[...]},
#  "properties":{"slope":[...],"elevation":[...],"distance":[...]}}}
```

### `/api/v1` Schemas

##### `Planet`

Enum. One of:

- `moon`
- `earth`

##### `LonLat`

Tuple representing a location in the geodetic CRS for a given planet.

```
(lon, lat)
```

##### `XY`

Tuple representing a location in XY coordinates for a given CRS.

```
(X, Y)
```

##### `CRS`

A string representing a Coordinate Reference System. Either a shorthand or well-known text (WKT). Examples:

**Lunar geodetic**:

```
"ESRI:104903"
```

**Lunar South Pole Stereographic (SPS)**:

```
"ESRI:103878"
```

Or it could be a full WKT.

**Lunar geodetic**:

```
"GEOGCS[\"GCS_Moon_2000\",DATUM[\"D_Moon_2000\",SPHEROID[\"Moon_2000_IAU_IAG\",1737400,0,AUTHORITY[\"ESRI\",\"107903\"]],AUTHORITY[\"ESRI\",\"106903\"]],PRIMEM[\"Reference_Meridian\",0,AUTHORITY[\"ESRI\",\"108900\"]],UNIT[\"degree\",0.0174532925199433,AUTHORITY[\"EPSG\",\"9122\"]],AUTHORITY[\"ESRI\",\"104903\"]]"
```

**Lunar SPS**:

```
"PROJCS[\"Moon_South_Pole_Stereographic\",GEOGCS[\"Moon 2000\",DATUM[\"D_Moon_2000\",SPHEROID[\"Moon_2000_IAU_IAG\",1737400.0,0.0]],PRIMEM[\"Greenwich\",0],UNIT[\"Decimal_Degree\",0.0174532925199433]],PROJECTION[\"Stereographic\"],PARAMETER[\"False_Easting\",0],PARAMETER[\"False_Northing\",0],PARAMETER[\"Central_Meridian\",0],PARAMETER[\"Scale_Factor\",1],PARAMETER[\"Latitude_Of_Origin\",-90],UNIT[\"Meter\",1]]"
```

##### `Extent`

List representing a region with non-zero area expressed in XY of the `CRS`.

```
[min X, min Y, max X, max Y]
```

##### `MapInfo`

Metadata for a GeoTIFF that's available for use with traverse problems and profiles.

Types:

- `slope`: Every pixel is a float (probably 32-bit) of the absolute value of the slope at that location
- `elevation`: Every pixel is a float of the elevation at that location (meters)
- `aspect`: Every pixel is a float of the direction of the slope at that location. N is `0`, increasing clockwise (degrees). Used for profiles only with a slope map in the same CRS (aspect is measured from its own grid's north)
- `tri`: Every pixel is a float of the terrain ruggedness index at that location. Higher values represent more difficult terrain
- `obstacle`: Represents a grid of yes/no pixels that blocks off the available search space due to external obstacles. These may include maps of boulders, craters, shadows, lack of comm coverage, etc

| Field         | Type                | Required | Notes                                                                                                                                                   |
| ------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string              | yes      | A unique name for the map                                                                                                                               |
| `planet`      | `Planet`            | yes      | The celestial body from which the data in the map was recorded                                                                                          |
| `type`        | enum                | yes      | One of `slope`, `elevation`, `aspect`, `tri`, `obstacle`                                                                                                |
| `crs`         | `CRS`               | yes      | The map's projection. Slope maps are always projected in meters; obstacle maps in another CRS are reprojected by `bin/prepare-maps.jl` (see the README) |
| `extent`      | `Extent`            | yes      | The region covered by the map                                                                                                                           |
| `resolution`  | tuple of two floats | yes      | Meters. `(res x, res y)`                                                                                                                                |
| `description` | string              | no       | Brief description of the map                                                                                                                            |

##### `Vehicle`

Rough vehicle characteristics for turning-radius aware traverses.

| Field                | Type  | Required | Notes                                                                                                                                                                                                      |
| -------------------- | ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max_turn_angle`     | float | yes      | Degrees, `> 0`. The largest heading change allowed in a single step; turns within +/- this value are considered. The implied turning radius is `step_distance / deg2rad(max_turn_angle)`.                  |
| `turning_increments` | float | no       | Degrees, `> 0`, `≤ 180`, `≤ max_turn_angle`. Spacing of the candidate turns between `-max_turn_angle` and `+max_turn_angle`. Defaults to `5.0`. Should divide `max_turn_angle` and 360 evenly (see below). |
| `step_distance`      | float | yes      | Meters, `> 0`. How far each step will "drive". Converted to pixels using the slope map's resolution; a value below one pixel is legal but pointless.                                                       |

**Example**:

```json
{
  "max_turn_angle": 30.0,
  "turning_increments": 5.0,
  "step_distance": 5.0
}
```

In this example, turns of -30.0, -25.0, -20.0, ..., 0.0, 5.0, ..., 25.0, and 30.0 degrees will be considered. For each step, we'll simulate a drive of 5.0 meters (a turning radius of about 9.5 m at the sharpest turn).

Validation failures return `400`, including a missing required field and `turning_increments > max_turn_angle` (the vehicle could only drive straight). Two configurations are accepted with a server-side warning rather than rejected: when `turning_increments` does not divide `max_turn_angle` evenly the extremes are floored (30/7 only reaches ±28°), and when it does not divide 360 evenly headings near ±180° may alias. Configurations beyond the planner's hard limits are rejected: more than 255 candidate turns per step (`2 * floor(max_turn_angle / turning_increments) + 1`), or more than 65535 heading bins (`360 / turning_increments`).

This is the same shape as a `[vehicles.<name>]` entry in the CLI's `problems.toml`, and maps 1:1 onto `Newton.Types.Vehicle`, whose constructor is the single place these rules are enforced for both the CLI and the API.

##### `TraverseProblem`

Describes a traverse to plan. A traverse yields exactly one path.

Version 1 supports two planners, selected by `method`: plain **A\*** (`"astar"`, the
default) and **turning-radius aware** A\* (`"turning_radius"`: Hybrid² A\*, the same
planner the CLI's `--turning-radius` flag uses). The request body is a flat object:

| Field                     | Type          | Required | Notes                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planet`                  | `Planet`      | yes      | The celestial body the traverse is on. Selects which maps to plan over.                                                                                                                                                                                                                                               |
| `waypoints`               | `LonLat` list | yes      | `[start, waypoint 1, ..., waypoint N, goal]`. Intermediate waypoints are optional; only `start` and `goal` are required (minimum length 2). A\* runs between each consecutive pair and the segments are concatenated into one path. **`"turning_radius"` accepts exactly two waypoints** (start, goal); more → `400`. |
| `slope_limit`             | float         | no       | Degrees. Pixels with slope ≥ `slope_limit` are not traversable. Defaults to `20.0` if omitted.                                                                                                                                                                                                                        |
| `slope_buffer_m`          | float         | no       | **Meters.** Blocks off terrain within this distance of regions that exceed the slope limit (rounded up to whole pixels of the slope map). Defaults to the server's `[defaults]` value (`0`) when no slope buffer form is set. At most one of `slope_buffer_m`, `slope_buffer` may be set (else `400`).                |
| `slope_buffer`            | int           | no       | **Deprecated**: pixels of the slope map. Logs a warning; use `slope_buffer_m`. `slope_buffer_px` is no longer supported: sending it is a `400`.                                                                                                                                                                       |
| `obstacle_maps`           | —             | no       | **No longer accepted** (`400`). The server chooses the obstacle maps (see "Obstacle maps" below); the GET response's `map_info` lists them.                                                                                                                                                                           |
| `obstacle_buffer_m`       | float         | no       | **Meters.** Blocks off terrain within this distance of obstacles. At most one of `obstacle_buffer_m`, `obstacle_buffer` may be set (else `400`). Applies to every obstacle map used, replacing each map's configured `buffer_m` (see "Obstacle maps" below).                                                          |
| `obstacle_buffer`         | int           | no       | **Deprecated**: pixels of the slope map. Logs a warning; use `obstacle_buffer_m`. `obstacle_buffer_px` is no longer supported: sending it is a `400`.                                                                                                                                                                 |
| `resolution`              | float         | no       | Meters. Reserved for selecting among several covering maps; the planner currently picks the highest-resolution slope map that covers every waypoint.                                                                                                                                                                  |
| `vehicle`                 | `Vehicle`     | no       | The vehicle's characteristics for a `"method": "turning_radius"` traverse. **Required** (else `400`) when `method` is `"turning_radius"`; silently ignored otherwise.                                                                                                                                                 |
| `method`                  | string        | no       | Defaults to `"astar"`. Either `"astar"` or `"turning_radius"` (case-insensitive, whitespace trimmed). Unknown values → `400`.                                                                                                                                                                                         |
| `subpixel_hazard_penalty` | float         | no       | `≥ 0`, default `0`. How strongly a route avoids slope pixels that an obstacle map finer than the slope map covers only in part. `0` treats them as free; larger values route around obstacle fields rather than through the gaps in them, at the cost of a longer path. Has no effect without such an obstacle map.   |

The slope map is chosen automatically: the highest-resolution registered `slope`
map for `planet` whose extent covers **every** waypoint. A `400` is returned when
no such map is registered, when a waypoint is not traversable (missing data, or
blocked by the slope limit or an obstacle map), or when no path exists between
two waypoints.

**Obstacle maps.** The server plans around every registered `type = "obstacle"`
map whose extent overlaps the selected slope map; a request can't choose them.

- **Partial coverage.** Where an obstacle map has no data (outside its extent),
  the terrain counts as free of its obstacles.
- **Other CRSs.** An obstacle map in a CRS other than the slope map's is used
  through a copy reprojected into the slope map's CRS by `bin/prepare-maps.jl`.
  Reprojecting grows obstacles by up to one pixel (it fails safe). If the map
  changes while the server runs, requests that would use it get a `503` until
  `bin/prepare-maps.jl` is re-run.
- **Resolution.** The path is planned on the slope map's pixels. Near
  obstacles from a map finer than the slope map, it is planned at the obstacle
  map's resolution, so it can pass between obstacles that share a slope pixel.
  Those stretches make jobs take longer, roughly in proportion to how many
  obstacles the route passes. With such a map, an `"astar"` path starts, ends
  and passes through the exact waypoints rather than their pixel centers.
- **Buffers.** Each obstacle map has a stand-off: the map's configured
  `buffer_m`, else the server's `[defaults] obstacles_buffer_m`. A request's
  `obstacle_buffer_m` replaces it for every map. Where the path is planned at
  an obstacle map's resolution, its buffer is exact in that map's pixels;
  elsewhere it is rounded up to whole slope-map pixels.
- **No rover footprint.** The path is a line, not a rover-sized corridor: near
  a fine obstacle map it can thread gaps narrower than the rover. Buffers are
  the remedy: set one at least half the rover's width.

**Turning-radius aware planning.** `"turning_radius"` uses Hybrid² A\*: it runs plain
A\*, finds path segments within roughly 2× `step_distance` of an obstacle, and
re-solves only those windows with a turning-radius-aware Hybrid A\* that respects
the `vehicle`'s turn limit. Segments far from obstacles keep the raw 8-connected
A\* geometry, so the result is **not** a globally smooth path — expect an A\* path
whose obstacle-adjacent portions are feasible for the vehicle, not Dubins-like
curves in open terrain. When a window cannot be solved the planner blocks those
pixels and restarts A\*, up to 20 times (after that, windows that still fail
are left as plain A\*), so these jobs can run considerably longer than plain
A\*. Cancellation (`DELETE`) is honoured between windows, not inside one. If
the restarts wall off the goal the job fails with "no turning-radius-feasible
path between start and goal".

##### Request hash

`request_hash` identifies a traverse's **effective planning inputs**: two
requests get the same hash exactly when the planner receives the same inputs,
however they were written. `effective_problem` is the object it was computed
over. Both are returned by `POST` (new and cached) and by `GET` in every status,
and both are stored with the traverse when it is accepted, so they never change
afterwards. Requests rejected with a `400` or `503` get neither.

`effective_problem` has the server defaults filled in and buffers in meters:

| Field                     | Notes                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| `planet`                  | As sent.                                                                                                |
| `waypoints`               | In order, at full precision.                                                                            |
| `method`                  | `"astar"` or `"turning_radius"`, normalized.                                                            |
| `slope_limit`             | Degrees; the server default when omitted.                                                               |
| `slope_buffer_m`          | Meters; a deprecated pixel buffer converted with the selected slope map's resolution.                   |
| `subpixel_hazard_penalty` | `0` when omitted.                                                                                       |
| `vehicle`                 | Only for `"turning_radius"`, with `turning_increments` defaulted.                                       |
| `slope_map`               | The registered name of the slope map the server selected.                                               |
| `obstacles`               | `[name, buffer in meters]` for each obstacle map the server selected, sorted by name. Absent when none. |

So writing differences hash equal (`method` omitted, `"astar"` or `" ASTAR "`;
`slope_limit` omitted or set to the default; `slope_buffer: 2` on a 5 m map or
`slope_buffer_m: 10`; a `vehicle` on an `"astar"` request or none), and
server-side changes that change the plan change the hash: a different default,
a newly registered finer slope map or overlapping obstacle map, a map's
configured `buffer_m`.

Maps are identified by their registered names, never by file paths, so the
same request on two servers with the same map names hashes equal. A map whose
file is replaced keeps its hash as long as its name stays the same, but the
traverse is planned again (the result cache tracks the files).

The format is `"v1:<sha256 hex>"`. The prefix names the rules above and changes
whenever they do, so a client can tell a rule change from an input change:
compare hashes only when their prefixes match. The hash is computed by Newton
only; clients should not try to reproduce it.

Coordinate spaces: `waypoints` are in `LonLat`. Map `extent`s and probe `extent`s are in `XY` of their `CRS`.

##### `WorkStatus`

Enum of:

- `pending`
- `cancelled`
- `in_progress`
- `failed`
- `succeeded`

##### `Job`

A background-job summary, as returned by `GET /api/v1/jobs`. Payloads
(`request`/`result`) are intentionally omitted from the list; fetch a specific
job's result via its own endpoint (e.g. `GET /api/v1/traverses/:id`).

| Field              | Type         | Description                                          |
| ------------------ | ------------ | ---------------------------------------------------- |
| `id`               | `string`     | Job UUID (also the `traverse_id` / `profile_id`).    |
| `kind`             | `string`     | `"traverse"` or `"profile"`.                         |
| `status`           | `WorkStatus` | Current lifecycle state.                             |
| `cancel_requested` | `bool`       | Whether cooperative cancellation has been requested. |
| `created_at`       | `string`     | ISO-8601 UTC timestamp when the job was submitted.   |
| `updated_at`       | `string`     | ISO-8601 UTC timestamp of the last state change.     |

##### `Path`

A properly formatted GeoJSON LineString.

##### `Profile`

A properly formatted GeoJSON `Feature` whose geometry is the traverse `Path` (a LineString) and whose `properties` contain one array per requested profile option. Each array is aligned to the LineString's vertices (same length and order).

Example:

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString", "coordinates": [[lon0, lat0], [lon1, lat1]] },
  "properties": {
    "slope": [3.1, 5.4],
    "elevation": [1024.0, 1019.5]
  }
}
```

---

## AEGIS integration notes (backend exploration)

Goal: let a traverse (the path between two adjacent stations in an EVA `sequence`) carry more
than one candidate path: the current straight-line/hand-drawn polyline, plus one or more
Newton A\* / turning-radius paths. This section records how AEGIS stores data today and
sketches options for storing Newton paths. No code has been changed.

### Findings

#### 1. How missions are stored

- **One Automerge document per mission.** The whole `Mission` object (`src/typings/mission.d.ts`),
  including `evas`, `stations`, `traverses`, `actions`, `pois`, `rexes`, lives in that document.
  There are no relational rows per entity at runtime.
- **Physical storage.** The server-side `Repo` (`src/server/express/server.ts`, stored in
  `globalValues.automergeRepo`) uses `PostgresStorageAdapter`
  (`src/server/automerge/automerge-storage-adapter-postgres.ts`) pointed at the table
  **`automerge_native_db`** (`key bytea[]` primary key, `value bytea`). It is opaque
  key/value storage for automerge-repo: binary snapshot and incremental chunks keyed by
  `[documentId, "snapshot"|"incremental"|..., hash]`. You can't query it with SQL; you have to
  load the document through the Repo.
- **Index table.** `doc_listing_db` (`Doc_Listing_db` model) maps the integer `missionId`
  (autoincrement) to the `automergeUrl`. `createAutomergeMission` in
  `src/server/express/routes/missionAutomerge.ts` creates the doc, inserts the listing, then
  writes `m.id` back into the doc. `getAutomergeMissionHandle(missionId)` is the server-side lookup.
- **Legacy tables.** The legacy `mission_db`, `traverse_db`, etc. schemas
  (`src/server/database/models/_legacyModels.ts`) are only used by the bootstrap/migration
  tooling. `mission_backup_db` (a JSONB mirror) was dropped in `Migration20260827000000_manual`.
- **Schema evolution** for doc contents uses Automerge "migrations"
  (`src/server/automerge/migrations/`, registered in `migrations/index.ts`). For example,
  `Migration20260902000000` back-fills `traverse.pathSegmentAbsoluteSlopes = null`. The doc
  shape is validated against `.local/schemas/mission.json`, which is generated from the
  `Mission` type with `--noExtraProps --required` (`npm run schema:create:mission`).
- **Other Postgres tables** that use normal MikroORM rows: app users, STM, layers, sublayers,
  presets, folders, environment config.

#### 2. Where EVA traverse paths are written

The path lives on the `Traverse` entity in the doc (`src/typings/itinerary.d.ts`):

```ts
path: AEGISPoint[] | null;                          // {lat, lng, alt?}
pathSegmentDistances: number[] | null;              // meters, one per segment
pathSegmentElevations: number[][] | null;           // per-segment DEM samples
pathSegmentAbsoluteSlopes: (number | null)[][] | null;
duration, traverseRate, ...
```

The EVA has no path of its own. Its `sequence` alternates `station`/`traverse` uuids, and the
full EVA route is the concatenation of its traverses' `path`s (see `routes/external/dust.ts`).

**The browser computes and writes every path.** The server only persists the Automerge sync
messages it receives. The write chain is:

- `stageTraverseUpdate` (`src/operations/stage/stage-traverse.ts`) does the work. It takes a
  custom path (or the existing path, or lander→lander), snaps the endpoints to the
  neighbouring stations, computes `pathSegmentDistances` with `getTotalDistance`, then calls
  `thunkFetchTerrainProfile`. That thunk hits `POST /api/v1/terrainProfile`, which samples the
  mission DEM in the server's raster worker pool.
- These callers write the result:
  - `thunkDocUpdateTraverse` (`src/store/thunk/thunkTraverse.ts`): user edits on the map
    via `InteractionManager.tsx`, and `thunkDocResetTraverse`. Writes through
    `applyUpsertTraverse`.
  - `thunkDocUpdateTraversesAroundStation`: runs when a station moves. Writes through
    `applyTraverseUpdatesStage` in `src/operations/apply/apply-traverse.ts`.
  - `thunkDocCreateEva` and `thunkDocDeleteStationFromEva` (`thunkEva.ts`), plus
    station-location staging (`thunkStation.ts`).
- Server-side traverse writes are limited to `op-mdau.ts` (Maestro: `duration`,
  `actionOrderUuids`, renames; never `path`) and Automerge migrations.
- **Server-originated doc writes already have precedent:** `POST /missionAutomerge/fields`,
  `routes/grid.ts` (`handle.change(...)` followed by `automergeRepo.flush()`), and Maestro
  MDAU. A server-side Newton writer would follow the same pattern.
- REX creation deep-clones traverses (`stageDuplicateTraverse` / `applyDuplicateTraverse`
  use `JSON.parse(JSON.stringify(traverse))`). Any new fields on `Traverse` get copied into
  every REX.

#### 3. Evidence of async tasks on the server

There is **no durable background-job system**: no BullMQ, pg-boss, cron, or jobs table. Every
existing async mechanism is either tied to a request or lives in memory:

| Mechanism                                       | Where                                                                        | Notes                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `setInterval` heartbeat (10 s)                  | `src/server/express/sockets.ts` (`globalValues.socketInterval`)              | Emits `statusFromServer`. Cleared in `gracefulShutdown` (`server.ts`).                                       |
| `worker_threads` pool with a bounded FIFO queue | `src/server/raster/rasterSamplingWorkerPool.ts`                              | Terrain-profile sampling. Has timeouts, respawn, and coalescing. Each job is awaited by an HTTP request.     |
| Throttled Automerge `change` listeners          | `maestro/v2/sockets-maestro-emitters.ts`, `dust/v1/sockets-dust-emitters.ts` | Run on doc changes in the background. Shows the server reacting to doc changes outside any request.          |
| Long-running streaming request                  | `routes/file/boxDownloadFile.ts`                                             | Box download/unzip with a progress heartbeat (`setInterval`) and retry delays. Lives for the request.        |
| `child_process.spawn`                           | `src/server/file/file.ts`                                                    | unzip and similar shell commands, awaited.                                                                   |
| Automerge Repo debounced saves                  | automerge-repo internals                                                     | Persistence to `automerge_native_db` is throttled. Callers use `repo.flush()` when they need it on disk now. |

`src/server/newton/http-newton.ts` already exists as a stub: a hard-coded `BASE_URL` (marked
"TODO move to env vars") and empty `probeMap` / `requestTraverse` functions.

### Constraints that shape the design

- Newton is **asynchronous** (`202` + `traverse_id`, then poll), and A\* / turning-radius
  jobs can run long. AEGIS has nothing that tracks a job across a request, a tab close, or a
  restart.
- **Doc size and history.** Automerge keeps every change forever and syncs the whole doc to
  every client. A\* paths are dense (one vertex per map pixel, roughly 1–5 m). With
  per-segment elevation/slope arrays on top, a few long candidate paths per traverse, copied
  again into every REX, could make the doc much larger. Deleting or replacing a path does
  not shrink history.
- **Consumers read only `traverse.path`.** That includes the map (`TraverseLines.tsx`),
  timeline, audits/calculated fields, Maestro (through calculated fields), and DUST. If
  `traverse.path` keeps meaning "the active path", all of them keep working unchanged.
- **Endpoint snapping breaks planned paths.** When a station moves, `stageTraverseUpdate`
  rewrites only the first and last vertex. That is fine for a straight line, but on an A\*
  path the snapped vertex can cut through terrain Newton avoided. A Newton path has to be
  marked stale (or replanned) when its endpoint stations move.
- **Coordinates.** AEGIS uses `AEGISPoint {lat, lng}`. Newton uses `LonLat` tuples
  `[lon, lat]` and GeoJSON `LineString`. `planet` must be supplied (`"moon"`); the mission
  only has `planetRadius`.
- **`turning_radius` takes exactly two waypoints.** One Newton job per AEGIS traverse
  (station pair) is the natural unit. Newton's request cache makes resubmitting identical
  requests cheap.
- **Maestro contract files** (`aegisSlice.d.ts`, `mdau.d.ts`) must not change. `AegisTraverse`
  has no path field, so keeping `traverse.path` as the active path needs no Maestro
  coordination.
- **Auth.** Any new AEGIS REST endpoint must go through `hasPerms` (session or `EMSS_TOKEN`).
  Calling Newton from the server keeps the URL and any future credentials off the client.

### Decisions

| Topic                | Decision                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paths per traverse   | One or more. Each Newton `POST /traverses` produces exactly one path; further paths come from follow-up POSTs with different arguments (`method`, `slope_limit`, buffers, `vehicle`).                                                                          |
| Storage              | **Option B.** Newton paths are machine output, not collaborative edits, so they go in a Postgres table with the GeoJSON in JSONB. They are not stored in Automerge.                                                                                            |
| Matching inputs      | Newton will be asked to return a request hash so a stored path can be matched to its input parameters (see "Hash" below).                                                                                                                                      |
| Async model          | Server-initiated. A server-side Automerge change listener detects traverse endpoint changes and submits Newton jobs (see "Automatic requests"). Users can also request extra parameter sets through REST. Any browser viewing the EVA polls AEGIS for results. |
| REX                  | A REX carries every option of its source traverse.                                                                                                                                                                                                             |
| Parameters           | Per request. Mission-level defaults may be added later.                                                                                                                                                                                                        |
| Whole EVA vs segment | Either is acceptable. This design plans one Newton job per traverse; a batch endpoint can fan out over an EVA.                                                                                                                                                 |
| Network / auth       | Newton is reachable from anywhere on the network, with no auth for now.                                                                                                                                                                                        |

Option A (all candidate paths inside the Automerge doc) was considered and rejected, mainly
because of doc growth: Automerge keeps every change forever, and every client syncs the
whole doc.

### Backend design

#### What lives where

- **Postgres, new table `traverse_path_db`.** Holds every candidate path with its request,
  Newton job id, status, GeoJSON result, and `map_info`. The raw geometry is stored at full
  resolution.
- **Automerge doc, on `Traverse`.** The existing `path` / `pathSegment*` fields stay the
  **active** path, so the map, timeline, audits, Maestro, and DUST need no changes. Add one
  optional field:

  ```ts
  // src/typings/itinerary.d.ts
  interface Traverse {
    // ...
    /** uuid of the selected traverse_path_db row; null/absent = manual or straight-line path */
    activePathUuid?: string | null;
  }
  ```

  Selecting an option copies its geometry into `traverse.path` and runs the existing
  distance and terrain-profile pipeline. This is the only time Newton geometry enters the
  doc, and only for the active path.

#### Keying rows by `refUuid` (this is how REX carries every option)

Rows are keyed by **`(mission_id, traverse_ref_uuid)`**, not by `traverse.uuid`.

- REX duplication keeps `refUuid`, so a REX traverse sees the same set of options as its
  as-planned traverse with no copying. REX creation happens in the browser inside one
  Automerge `.change()`; copying rows during that change would need a second,
  non-atomic REST call, and keying by `refUuid` avoids it.
- `activePathUuid` is copied into the REX by the existing deep clone, so the REX starts
  on the same selection.
- Mission duplication (`src/utils/dup/core.ts`) clones the doc with the same `refUuid`s, so
  copying the rows with a new `uuid` and `mission_id` is enough.
- **Side effect:** options created after a REX exists, whether in the as-planned scope or
  in another REX, also show up in that REX. If that is unwanted, filter on
  `created_from_traverse_uuid` (the provenance column below) or `created_at`. Decide this with
  the UX.

#### When an option applies to a traverse

Each row stores the start and end points it was planned with. An option **applies** to a
traverse only when those points match the traverse's current endpoints (from
`getTraverseEndpoints`), within a small tolerance. The browser can compute this because it
already has the doc.

- No stale flag needs to be stored or kept in sync. When a station moves, its old options
  simply stop applying, in every scope independently.
- REX and as-planned stations can move apart, and each scope gets the right answer.
- Moving a station back makes the old options apply again.
- In `stageTraverseUpdate` (`src/operations/stage/stage-traverse.ts`), when a traverse with
  an `activePathUuid` gets new endpoints, clear `activePathUuid` and reset the traverse to a
  straight line instead of moving only the end vertices. Moving the end vertices of an A\*
  path can cut through terrain the planner avoided. The final behaviour is a UX call, but
  this change is in the backend/doc layer.

#### Table: `traverse_path_db`

MikroORM model `src/server/database/models/traverse_path.model.ts`, plus a migration, plus
registration in `_allModels.ts`.

| Column                       | Type          | Notes                                                                                                                                                   |
| ---------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uuid`                       | uuid pk       | Value written to `Traverse.activePathUuid`.                                                                                                             |
| `mission_id`                 | int           | Indexed.                                                                                                                                                |
| `traverse_ref_uuid`          | text          | Index `(mission_id, traverse_ref_uuid)`.                                                                                                                |
| `created_from_traverse_uuid` | text          | Provenance: which scope (as-planned or a REX) requested it.                                                                                             |
| `start_point`, `end_point`   | jsonb         | `AEGISPoint` endpoints used; drives the "applies" check.                                                                                                |
| `method`                     | text          | Effective method (`astar` / `turning_radius`), taken from Newton's GET response.                                                                        |
| `request`                    | jsonb         | `TraverseProblem` exactly as sent.                                                                                                                      |
| `params_key`                 | text          | AEGIS-side canonical key (rounded endpoints + params). Unique `(mission_id, traverse_ref_uuid, params_key)`.                                            |
| `request_hash`               | text null     | From Newton. Plain index. Only `v1:` values are comparable (see "Hash").                                                                                |
| `newton_deduplicated`        | bool          | `true` when Newton merged this POST into another caller's job (future). Never cancel these.                                                             |
| `newton_traverse_id`         | text          |                                                                                                                                                         |
| `status`                     | text          | Newton `WorkStatus` (`pending`, `in_progress`, `succeeded`, `failed`, `cancelled`), plus AEGIS-only `submitting` (row inserted, POST not yet accepted). |
| `submit_attempts`            | int           | Count of POST attempts; drives backoff on `503`/network errors.                                                                                         |
| `path`                       | jsonb null    | GeoJSON `LineString` (`[lon, lat]`), full resolution. Set on `succeeded`.                                                                               |
| `map_info`                   | jsonb null    | Newton `MapInfo[]`: the slope map plus every obstacle map used.                                                                                         |
| `runtime_ms`                 | int null      |                                                                                                                                                         |
| `error`                      | jsonb null    | Newton error object (POST error model, or GET `error` on `failed`), or an AEGIS-side message.                                                           |
| `label`                      | text null     | Optional user-facing name ("Slope ≤ 10°").                                                                                                              |
| `owner_id`                   | int null      |                                                                                                                                                         |
| `created_at`, `updated_at`   | timestamptz   |                                                                                                                                                         |
| `last_polled_at`             | timestamptz   | Rate-limits refresh calls to Newton.                                                                                                                    |
| `version`                    | int (version) | Optimistic lock so two concurrent pollers finalize a row only once.                                                                                     |

Profile arrays (elevation and slope) are **not** stored. AEGIS computes them from its own
DEM when an option is selected, so the numbers match manual traverses. If the UI needs to
compare options before selecting one, add a nullable `profile` JSONB column filled on
success, either from Newton `/traverses/profiles` or from AEGIS's
`readTerrainProfileInWorker`.

#### Hash (Newton `request_hash`)

This section is the agreed contract with the Newton team, reflecting their reply to the
AEGIS brief.

**What Newton hashes.** The hash covers the effective planning inputs after normalization
and defaults:

- `planet`, the effective `method`, and `waypoints` in order;
- the effective `slope_limit` and slope buffer in meters;
- `vehicle`, only for `turning_radius`;
- the **name of the selected slope map**, which Newton picks: the finest map covering
  every waypoint;
- **each obstacle map's name with its buffer in meters**. Newton picks these too: every
  registered obstacle map that overlaps the slope map.

**What it leaves out.** Map versions, contents, and file paths, so the hash is stable
across hosts. `resolution` is accepted but ignored, so it stays out until it affects
planning; adding it will bump the prefix.

**Rules from Newton:**

- **Format.** `"v1:<sha256 hex>"`, built from sorted keys and Julia's float printing. A
  Newton test pins a fixed request to a fixed hash. **AEGIS must never compute or
  recompute it.** If that's ever needed, ask Newton, and they'll move to RFC 8785 under
  `v2:`.
- **Older jobs.** Jobs created before the hash shipped keep what was stored: unprefixed or
  `null`. **Only `v1:` values can be compared.** Treat anything else as "no hash".
- **Where it appears.** In both `202` forms of `POST /api/v1/traverses` (new job and
  `"cached": true`) and at the top level of `GET /api/v1/traverses/:id` in every status.
  It is stored when the job is created and never recomputed.
- **When it's missing.** There is no hash on a `400`, or on a `503`. A `503` means an
  obstacle map changed on disk and is being re-prepared.
- **Map changes.**
  - Registering a new overlapping obstacle map, or a finer slope map, **changes the hash**.
    This is the same as a change to a Newton `[defaults]` value.
  - A map whose file changes but keeps its name **keeps the same hash**, but Newton still
    replans, because its cache keys on file paths and fingerprints. By convention, changed
    maps get new filenames.
  - `map_info` carries no versions or checksums, and won't.
- **`obstacle_maps` in a request is a `400`.** So are `slope_buffer_px` and
  `obstacle_buffer_px`. AEGIS doesn't send obstacle maps; Newton chooses them. The
  `TraverseProblem` table earlier in this file still lists `obstacle_maps` and `_px`
  buffers; Newton's reply supersedes it.

**Fields AEGIS can rely on in `GET /traverses/:id`:**

- `method` is always filled in;
- `error` explains a `failed` status;
- `map_info` lists the slope map and every obstacle map used;
- `request_hash`.

**Planned Newton follow-ups**, to design for but not depend on yet:

- **Merging identical in-flight requests.** These responses carry `"deduplicated": true`.
  **A `DELETE` on a merged job cancels it for every caller that shares it**, so AEGIS must
  not cancel jobs it didn't create.
- **`effective_problem`** in the `GET` response, `null` for jobs created before it ships.
- **`GET /api/v1/traverses?request_hash=...`**, newest first, paginated with `next_cursor`.

**How AEGIS uses the hash:**

- Store it on each row with a plain index, not a unique one. It stays `null` until Newton
  answers, and stays `null` on `400` or `503`.
- **Grouping candidates in the UI.** Rows with the same `v1:` hash and the same
  `traverse_ref_uuid` are one candidate. The hash includes waypoints, so this only
  merges rows planned at the same endpoints.
- **Detecting a change on Newton's side.** The same `params_key` resubmitted later with a
  different hash means Newton's defaults or map selection changed, such as a new obstacle
  map or a finer slope map. Surfacing this to users ("planned with older maps") is out of
  scope for now.
  - A map edited in place under the same name isn't detectable from the hash; Newton
    replans it anyway.
- **Debugging.** Correlate an AEGIS row with a Newton job.
- **Not for deciding whether to submit.** That's the AEGIS-side `params_key` unique index,
  which AEGIS needs before calling Newton.
- Derived from `map_info`: store the slope map and obstacle map names and show them with
  each candidate ("planned on `<slope map>`, avoiding `<obstacle maps>`").

#### REST routes (`src/server/express/routes/traversePath.ts`)

All routes are gated by `hasPerms({ missionId, permission, appUser, emssToken })`, which
also accepts `EMSS_TOKEN`. All responses are `WrappedResponse<T>`. Browser wrappers go in
`src/http-client/traversePath.ts`, and ambient types in `src/typings/traversePath.d.ts`.

| Method   | Path                                                       | Perm | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ---------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/traversePath`                                     | edit | Body: `{ missionId, traverseUuid, params: { method?, slopeLimit?, slopeBufferM?, obstacleBufferM?, vehicle? }, label? }`. No `obstacleMaps`: Newton picks obstacle maps and rejects the field. See the steps below the table.                                                                                                                                                                                  |
| `POST`   | `/api/v1/traversePath/eva`                                 | edit | Body: `{ missionId, evaUuid, params }`. Runs the single-traverse POST for each traverse in the EVA's `sequence` and returns all the rows. Covers "plan the whole EVA".                                                                                                                                                                                                                                         |
| `GET`    | `/api/v1/traversePath?missionId=&traverseRefUuids=a,b,...` | view | Lists rows for the given traverses (one EVA's worth per call). Refreshes rows that are not yet finished first (see Polling).                                                                                                                                                                                                                                                                                   |
| `GET`    | `/api/v1/traversePath/:uuid?missionId=`                    | view | One row, refreshed the same way.                                                                                                                                                                                                                                                                                                                                                                               |
| `DELETE` | `/api/v1/traversePath/:uuid?missionId=`                    | edit | If the job is still running **and** `newton_deduplicated` is false, calls Newton `DELETE` (a `409` because it already finished is fine). Merged jobs are never cancelled, since that would cancel them for every caller sharing them. Then deletes the row. A traverse that still has this uuid active keeps its copied geometry; its `activePathUuid` then points at nothing and the UI shows it as "custom". |
| `GET`    | `/api/v1/traversePath/probe?missionId=&traverseUuid=`      | view | Optional. Proxies Newton `maps/probe` for the traverse's extent so the UI can disable "plan" when no slope map covers it.                                                                                                                                                                                                                                                                                      |

Steps for `POST /api/v1/traversePath`:

1. Load the doc on the server with `getAutomergeMissionHandle`.
2. Resolve the traverse's `refUuid` and its endpoints with `getTraverseEndpoints`, using the
   EVA that contains it.
3. Build the `TraverseProblem`: `planet: "moon"`, and `waypoints: [[lng, lat], [lng, lat]]`
   from the endpoints.
4. Insert or reuse the row by `params_key` (the same code path as the watcher; see
   "Submitting jobs"). Resubmit if the existing row is `failed` or `cancelled`.
5. POST it to Newton. Store `newton_traverse_id`, `request_hash`, and `newton_deduplicated`.
6. Return the row: `pending`, or `succeeded` when Newton returns `cached: true`.

The server resolves the endpoints itself, so the client can't submit waypoints that don't
match the traverse. It doesn't write to the doc.

#### Polling (refresh on read)

There is no server-side poller or job runner, which fits the current server: it has nothing
to run background jobs. On each `GET`, for every row that hasn't finished:

1. Skip it if `last_polled_at` is less than about 2 s ago. Several browsers polling the
   same EVA then cost about one Newton call per row per interval.
2. Call Newton `GET /traverses/:id`. Store `status`, `method`, `runtime`, `map_info`, `error`
   (on `failed`), and, on success, `path`. `request_hash` is fixed when the job is created, so
   it isn't overwritten.
3. Save with the `version` lock. If another request already finished the row, reload it
   and return that instead.
4. Newton stores job ids in a database and keeps them indefinitely, so a row can be finished
   whenever someone next views it. A `404` would only come from an unexpected loss of
   Newton's job store; mark the row `failed` with an explanatory error so the user can
   retry.

The browser polls every few seconds **only while some visible row hasn't finished**, then
stops. If the browser closes, nothing is lost: the row and the Newton job remain, and the
next viewer's GET picks up the result. If nobody looks, the row just stays unfinished until
someone does.

Optional: when a row finishes, call `emitStoreUpsert` (the preset/STM pattern in
`src/server/express/sockets.ts`) so other open tabs update without polling. Polling stays as
the fallback.

#### Selecting an option (doc write, browser side)

Add `thunkDocSelectTraversePath({ traverseUuid, pathUuid | null })`:

1. Convert the row's GeoJSON to `AEGISPoint[]`. `null` means reset to a straight line, as
   `thunkDocResetTraverse` does today.
2. Optionally simplify the line with Douglas–Peucker, at a tolerance below the DEM
   resolution so it can't cut corners Newton avoided. This keeps the active path's doc
   footprint small.
3. Run the existing `stageTraverseUpdate` with `overrides.path`. It computes distances and
   calls the terrain-profile endpoint. The endpoints already match, because an option is only
   offered when it applies.
4. Make one `.change()` that writes the path fields and `activePathUuid`, using a new
   `applySelectTraversePathStage` in `apply-traverse.ts`.

Watch the terrain-profile sample cap (`MAX_RASTER_PROFILE_SAMPLES` = 100k). Every segment
takes at least 2 samples, so a dense path with N vertices needs at least 2N samples. A
5 km path at 1 m spacing is about 10k samples, which is fine; simplification adds headroom.

#### Lifecycle and cleanup

| Event                 | Action                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mission delete        | `nativeDelete(TraversePath_db, { missionId })` in `deleteMissionRelatedEntities` (`missionAutomerge.ts`).                                                                                                                               |
| Mission duplicate     | Copy rows in `createMissionCopy` with a new `uuid` and `mission_id`. Remap `activePathUuid` in the new doc, or clear it there.                                                                                                          |
| Mission dump / import | Add `traversePaths` to `MissionSourceData` (`src/typings/network/export.d.ts`) and to `fetchMissionSourceData`.                                                                                                                         |
| Traverse / EVA delete | The doc delete happens in the browser, so rows become orphans. Filter orphans out when listing (no traverse in the doc has that `refUuid`). Optionally add a delete-orphans step that runs when a mission loads or from an admin route. |
| Station move          | Nothing in the DB. The option stops applying, and `stageTraverseUpdate` clears `activePathUuid` (see above).                                                                                                                            |

#### Doc and schema changes

- Add `activePathUuid?: string | null` to `Traverse`, then run `npm run schema:create`. The
  mission schema is built with `--noExtraProps`, so the field must be in the type.
- Add an Automerge migration that back-fills `activePathUuid = null`, following
  `Migration20260902000000`, and register it in `migrations/index.ts`.
- `stageDuplicateTraverse` / `applyDuplicateTraverse` copy the field automatically.
  Duplicating a traverse outside a REX (which gets a new `refUuid`) should clear it, because
  the rows belong to the old `refUuid`.
- Maestro contract files are untouched.

#### Server modules

- `src/server/newton/http-newton.ts`: replace the stub. Read the base URL from
  `NEWTON_BASE_URL`, with a request timeout. Add `health`, `probeMaps`, `postTraverse`,
  `getTraverse`, and `cancelTraverse`. Map the Newton error model to typed errors.
- `src/server/newton/convert.ts`: `AEGISPoint` ↔ `[lon, lat]` ↔ GeoJSON.
- Newton wire types go in an ambient `.d.ts` (e.g. `src/server/newton/types/newton.d.ts`),
  following the repo convention.

#### Tests

- **Unit:** coordinate conversion, "applies" matching, request building (never includes
  `obstacle_maps` or `_px` buffers), `params_key` upsert logic, and `v1:` hash comparison
  (unprefixed and `null` hashes are treated as "no hash").
- **Route:** `hasPerms`, including `EMSS_TOKEN`. Use a mocked Newton client covering:
  `cached: true`, pending → succeeded, failed (with the GET `error`), Newton `404`, cancel
  versus `409`, no cancel on `deduplicated: true`, `503` → `submitting` with retry and
  backoff, `400` → `failed`, two
  concurrent GETs finishing the same row (the version lock), and the `last_polled_at`
  throttle.
- **Lifecycle:** mission delete, duplicate, and dump include the rows.
- **Stage:** `stageTraverseUpdate` clears `activePathUuid` when endpoints change, and the
  selection stage/apply writes the expected doc fields.

### Resolved questions

| Question                                               | Answer                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Should options from one scope show up in other scopes? | TBD. Rows are shared by `refUuid`; filter on `created_from_traverse_uuid` if needed.   |
| Will Newton return `request_hash`?                     | Yes. It includes the slope and obstacle map names; see "Hash" for the agreed contract. |
| Where does `planet` come from?                         | Hard-coded to `"moon"`.                                                                |
| Show "a newer plan is available" when maps change?     | Maybe later, not now.                                                                  |
| How long does Newton keep `traverse_id`s?              | Job ids are saved to a database and kept indefinitely.                                 |

### When to request paths: existing hook points

AEGIS has **no single hook or event** for "a station was added to a traverse" or "a
traverse's endpoints changed". The browser computes every endpoint change itself, through
one of the `thunkDoc*` thunks below. Each thunk works out the affected traverses, calls
`stageTraverseUpdate` (`src/operations/stage/stage-traverse.ts`) or its own path builder,
and applies the result through `applyTraverseUpdatesStage` / `applyUpsertTraverse`
(`src/operations/apply/apply-traverse.ts`). The server only receives the resulting
Automerge sync.

#### Where endpoints change

Traverses are always created with `path: []` (`generateBlankTraverse` in
`src/store/storeUtils/traverse.ts`) and don't get endpoints until a station sits on each
side.

| Thunk (file)                                                            | UI trigger                                                                     | Traverses affected                                        | Path written via                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `thunkDocCreateEva` (`thunkEva.ts`)                                     | "New EVA"                                                                      | the single lander→lander traverse                         | inline profile fetch → `applyUpsertTraverse`                                                                |
| `thunkDocAddStationToEva` (`thunkEva.ts`)                               | "Add station" in the EVA pane (`eva-item-sequence.tsx`, `eva-running-rex.tsx`) | inserts `{station: ""}` + a blank traverse before ingress | `applyUpsertTraverse` with an **empty** path. No endpoints yet, because the station slot is empty.          |
| `thunkDocChangeStationInEva` (`thunkEva.ts`)                            | picking a station in a sequence slot (`eva-item-sequence-station.tsx`)         | traverse before and after the slot                        | `stageTraverseUpdate` ×2 → `applyTraverseUpdatesStage`                                                      |
| `thunkDocChangeIngressEgress` (`thunkEva.ts`)                           | changing egress/ingress                                                        | the boundary traverse                                     | `stageTraverseUpdate` → `applyTraverseUpdatesStage`                                                         |
| `thunkDocReorderStationInEva` (`thunkEva.ts`)                           | move station up or down                                                        | up to 3 traverses                                         | `stageTraverseUpdate` → `applyTraverseUpdatesStage`                                                         |
| `thunkDocDeleteStationFromEva` (`thunkEva.ts`)                          | remove station from EVA                                                        | the traverse before it (the one after is deleted)         | `stageTraverseUpdate` → `applyTraverseUpdatesStage`                                                         |
| `thunkDocUpdateStationLocation` (`thunkStation.ts`)                     | dragging a station on the map, or editing its coordinates                      | every traverse next to the station, in **every** EVA      | its own `buildTraversePath` (already has a `TODO ... "realistic" path`) → `applyStationLocationUpdateStage` |
| `thunkDocUpdateTraversesAroundStation` (`thunkTraverse.ts`)             | **no callers today** (dead code)                                               | traverses next to a station                               | `stageTraverseUpdate` → `applyTraverseUpdatesStage`                                                         |
| `thunkDocUpdateLanderLocation` (`thunkMission.ts`, `stage-lander.ts`)   | moving the lander                                                              | every traverse that starts or ends at the lander          | its own builder → `applyLanderLocationUpdateStage`                                                          |
| `thunkDocUpdateTraverse` / `thunkDocResetTraverse` (`thunkTraverse.ts`) | hand-editing a traverse on the map (`InteractionManager.tsx`), reset           | that traverse                                             | `stageTraverseUpdate` → `applyUpsertTraverse`                                                               |
| `thunkDocDuplicateEva` / REX creation                                   | duplicate or execute                                                           | copies traverses unchanged                                | no endpoint change                                                                                          |
| Maestro MDAU (`op-mdau.ts`)                                             | Maestro                                                                        | never changes endpoints or `path`                         | —                                                                                                           |

The common choke point is **`applyTraverseUpdatesStage`**. It is reached from
`stageTraverseUpdate` callers, `applyStationLocationUpdateStage`, and
`applyLanderLocationUpdateStage`. Only EVA creation and `thunkDocUpdateTraverse` use
`applyUpsertTraverse` directly. Every one of these goes through
`TraverseUpdateStageData` or a full `Traverse`. Both contain the new `path`, so the new
endpoints are `path[0]` and `path.at(-1)`.

#### Options for triggering Newton requests

1. **Explicit user action (recommended first).** Add a "Plan path" action per traverse,
   plus "Plan all" per EVA, that calls `POST /api/v1/traversePath[/eva]`. This needs no hook
   at all; the existing endpoint thunks stay unchanged. Because the "applies" check
   compares the stored endpoints, the UI shows existing options whenever they still match.
2. **Automatic, in the browser, after an endpoint change.** Add a post-apply side effect
   (a new Step 3 in each thunk above, or one helper they all call) that compares each
   updated traverse's old and new endpoints. When they changed and both endpoints are
   set, it fires `POST /api/v1/traversePath` with default parameters. Pros: immediate, and
   it reuses data the thunk already has. Cons: about 8 call sites to keep in sync; dragging a
   station would trigger a request on every drop unless debounced; and a request is made
   for every client action, even ones nobody looks at. (Newton's cache and AEGIS's
   hash-based dedupe make repeats cheap.)
3. **Automatic, on the server, via an Automerge doc-change listener.** Follow the
   Maestro and DUST pattern (`missionDocHandle.on("change", throttle(...))` in
   `sockets-maestro-emitters.ts` / `sockets-dust-emitters.ts`). For each mission, keep a
   snapshot of `{traverseUuid → [path[0], path.at(-1)]}`. On change, diff the snapshot and
   submit Newton jobs for traverses whose endpoints changed. Pros: one place, catches
   every path (including future ones and other clients), and needs no client changes.
   Cons:
   - The listener only runs for docs the server has loaded. It would need to be
     attached to every mission on boot, or when a mission is first opened.
   - The server would be writing jobs nobody asked for.
   - A throttle can see an intermediate state, so debounce instead (wait until edits stop,
     for example 2–5 s).
   - REX copies share `refUuid` with their as-planned traverse but have their own
     endpoints. Dedupe on (refUuid, endpoints, params) — the row's start/end points plus
     `request_hash` handle this.
4. **Lazily, on view.** When the EVA pane or traverse info opens (or
   `GET /api/v1/traversePath` runs), auto-submit a default-parameter job for any traverse
   that has endpoints but no applying option. Pros: requests are only made for what people
   actually look at, and it fits the refresh-on-read polling. Cons: the first viewer waits
   for the job.

**Decision: option 3.** Requests are automatic. The server has capacity for many
simultaneous traverses, and one server-side choke point is preferred over client call
sites. Option 1 (explicit "plan with these parameters") stays available through
`POST /api/v1/traversePath` for extra parameter sets.

### Automatic requests: server-side endpoint watcher

#### Choke point

Watch **derived endpoints**, not `traverse.path`. For each traverse in each EVA `sequence`,
compute `getTraverseEndpoints(traverseUuid, eva.sequence, mission.stations)` from
`src/operations/helpers/getTraverseEndpoints.ts`. That function is already pure and has no
client dependencies, and `src/operations/helpers/evaSequence.ts` is already imported by
server code. The result is a snapshot:

```ts
// src/server/newton/types/newton.d.ts (ambient)
type TraverseEndpointSnapshotEntry = {
  traverseUuid: string;
  traverseRefUuid: string;
  evaUuid: string;
  rexUuid: string | null; // null = as-planned scope
  start: AEGISPoint;
  end: AEGISPoint;
  key: string; // `${start.lat},${start.lng}|${end.lat},${end.lng}`, rounded
};
type TraverseEndpointSnapshot = Map<string /* traverseUuid */, TraverseEndpointSnapshotEntry>;
```

Why derive the endpoints instead of reading `path[0]` and `path.at(-1)`:

- The station and the EVA sequence are the source of truth. Every path-changing thunk in
  the table above, and the lander-copy stations updated by `thunkDocUpdateLanderLocation`,
  changes one of the two.
- Server-side writers are covered too: Maestro MDAU and `POST /missionAutomerge/fields`.
  So are code paths added later, with no client changes.
- Blank traverses (`path: []`) and stations without a `location` yet drop out naturally:
  skip any entry where either endpoint is missing or not finite. A request goes out
  exactly when a traverse first has a station on both sides, which answers "when a
  station is added to a traverse".
- It doesn't depend on the client's async terrain-profile fetch finishing first.

The listener diffs the new snapshot against the previous one. Any entry that is **new**,
or whose `key` changed, is "changed". Removed entries need no action, because orphaned
rows are filtered out on read.

#### Listener lifecycle (follows the Maestro/DUST emitter pattern)

`src/server/newton/traversePathWatcher.ts`, with its state in `globalValues.newton`:
`docListeners`, `docHandles`, `snapshots`, and `debouncers`.

- **Attach** to every non-archived mission at boot, after the Repo is ready, and in
  `createAutomergeMission` (which covers create, duplicate, and import).
  - The Maestro/DUST listeners attach only while a socket visitor is in the room, so they
    can miss edits. A Newton watcher has to catch every edit, and Automerge sync from
    a browser can arrive independently of Socket.IO presence. That's why it attaches to
    every mission.
  - The Maestro routes already call `getAutomergeMissions()` for all missions, so
    keeping every doc loaded isn't a new memory cost.
- **Detach** in `deleteAutomergeMissions`, on archive, and in `gracefulShutdown`. Cancel
  pending debouncers and drop the snapshots.
- Use the same guards as `addMaestroDocListenerForMission`: a placeholder entry set
  before any `await`, so two concurrent attaches can't install duplicate listeners.
- Use a **trailing debounce** per mission (about 3 s, `maxWait` about 30 s), not a
  throttle. Typing coordinates or dragging several stations shouldn't send intermediate
  endpoints.
  - Diffing full snapshots (as `computeMaestroDiff` does) means intermediate patches can
    be dropped safely.

#### Submitting jobs

`src/server/newton/traversePathJobs.ts`:

1. For each changed entry, and for each **default parameter set** (see below), build the
   `TraverseProblem`: `planet: "moon"`, `waypoints: [[start.lng, start.lat], [end.lng, end.lat]]`.
2. **Idempotent insert before calling Newton.** Insert the row with
   `status = "submitting"`, `newton_traverse_id = null`, and a unique **`params_key`**. The
   key is AEGIS-side: canonical JSON of the endpoints (rounded) plus the parameters.
   Use the unique index `(mission_id, traverse_ref_uuid, params_key)`.
   - On conflict, skip. A row already exists, possibly from another scope or an earlier
     identical position.
   - This makes debounce flushes, boot reconciliation, and REX copies safe to repeat.
   - A REX traverse at the same endpoints as its as-planned traverse produces no second
     job.
3. POST to Newton through a small in-process concurrency limiter, configurable
   (`NEWTON_MAX_IN_FLIGHT`, e.g. 16). Capacity isn't the concern; this smooths bursts such
   as boot backfill or duplicating a large mission.
4. Store `newton_traverse_id`, `request_hash`, `newton_deduplicated`, and the initial
   status. When Newton returns `cached: true`, fetch and finish the row immediately.
5. **Errors:**
   - **`503`** (Newton is re-preparing a changed obstacle map) and network errors are
     **transient**. Keep the row in `submitting`, increment `submit_attempts`, and retry
     with backoff (for example 5 s, 30 s, 2 min, up to about 5 attempts) through the same
     limiter. Rows still in `submitting` are also retried on the next refresh-on-read
     `GET`, or at boot reconciliation, so a restart can't strand them.
   - **`400`/`422`** and other `4xx`, or exhausted retries: store `status = "failed"` and
     the Newton error. Examples: a waypoint not traversable, or no slope map covering it.
     The unique key stops the next edit at the same position from retrying
     automatically, so retry is the user's call (`POST /api/v1/traversePath` resubmits
     failed rows).

Superseded jobs (the station moved again) are **not cancelled**. They are cheap, Newton
caches them, and moving the station back makes the result apply again. Not cancelling also
keeps AEGIS safe once Newton merges in-flight duplicates: cancelling a merged job would
cancel it for every caller sharing it.

#### Default parameter sets

These are per request, with no mission defaults yet, so automatic jobs use a
server-configured list. Each entry produces one row (one candidate path) per traverse
position:

```ts
// e.g. src/server/newton/defaults.ts, overridable by env/JSON later
// Decided: planet "moon", method "astar"; every other field omitted so Newton's defaults apply.
const AUTO_TRAVERSE_PARAM_SETS: NewtonTraverseParams[] = [{ label: "A*", method: "astar" }];
```

Mission-level defaults can later replace this list. They would be a new `Mission` field
that the watcher reads from the doc it already has.

#### Boot reconciliation and backfill

On attach, take the initial snapshot and **submit every entry**. The idempotent insert turns
this into "submit only what's missing", so it:

- backfills existing missions on first deploy;
- covers any edits made while the server was down. (This shouldn't happen, because the
  server is the sync hub and the epoch gate blocks stale tabs, but it costs nothing.)

Gate this behind a flag (`NEWTON_AUTO_BACKFILL=true`) so it can be turned off if
first-deploy volume matters.

#### Clearing `activePathUuid` at the same choke point

When the watcher sees a changed entry whose traverse has an `activePathUuid`, and that
row's endpoints no longer match, it makes one server-side
`handle.change(m => applyClearActiveTraversePath(m, { traverseUuids }))`. That change
clears `activePathUuid` and resets `path` to `[start, end]`.

- This puts all the stale-path logic in one place and needs no edits to
  `stageTraverseUpdate`, `buildTraversePath`, or `stage-lander.ts`.
- Recompute `pathSegmentDistances` with `getTotalDistance`, and the elevation/slope profile
  with `readTerrainProfileInWorker`, before the change. That keeps the write atomic, as
  `stageTraverseUpdate` does on the client. Re-read the doc just before applying and skip
  the write if the endpoints moved again in the meantime.
- **Tradeoff:** there is a short window, between the client's snapped write and the
  server's reset, where the A\* path is shown with a moved end vertex. If that window is
  unacceptable, move only the clearing into `stageTraverseUpdate` on the client (still
  one function, but `buildTraversePath` and `stage-lander.ts` build their paths separately
  and would need it too).

The server's own write doesn't change any endpoint, so it doesn't trigger the watcher
again.

#### What changes from the earlier design

- `POST /api/v1/traversePath` remains for extra, user-chosen parameter sets and for retrying
  failed rows. Automatic requests use the same `traversePathJobs` code.
- Polling is unchanged: browsers viewing the EVA poll `GET /api/v1/traversePath`, and the
  server refreshes unfinished rows on read. An optional server-side poller (one interval
  in `globalValues`, cleared on shutdown) would be needed only if results must be written
  into the doc without anyone viewing, for example to auto-select a finished path
  (not planned: auto-select is out of scope for now).
- `params_key` (unique) decides whether to submit. `request_hash` (plain index, Newton-owned)
  is used for grouping and for detecting changes on Newton's side. See "Hash".

#### Tests

- **Snapshot builder (pure):**
  - blank traverse and station with no location are skipped;
  - choosing a station in a slot produces two changed entries;
  - a reorder changes three;
  - a lander move changes every lander-adjacent traverse;
  - a REX copy at the same endpoints yields the same `params_key`.
- **Watcher:** debounce coalesces several changes into one flush; detach cancels the
  pending flush; concurrent attach installs one listener.
- **Jobs:** a conflict on `params_key` skips the Newton call; the limiter caps in-flight
  requests; a POST failure produces a `failed` row; `cached: true` finishes the row
  immediately.
- **Clear-active:** clears only when the row's endpoints differ; skips if the endpoints
  moved again before applying.

#### Decisions for this approach

- **Automatic parameters.** `planet: "moon"` and `method: "astar"`. All other fields are
  omitted so Newton's defaults apply. That gives one automatic candidate per traverse
  position.
- **REX traverses are watched**, the same way as as-planned ones. The `params_key` dedupe
  keeps this cheap.
- **Stale-path window: accepted.** For a moment after a station or lander move, a traverse
  showing a Newton path has its end vertex snapped to the new location, until the server's
  reset arrives (the debounce delay plus one profile sample). Fixing this would need
  clearing logic in `stageTraverseUpdate`, `buildTraversePath`, and `stage-lander.ts` on
  the client.
- **No auto-select (for now).** When a Newton path finishes, the traverse keeps its current
  path (the straight line, or the user's hand edit) as the active one. The finished Newton
  path is shown as an inactive candidate that the user can select. So the server never
  writes Newton geometry into the doc, and no server-side poller is needed. Results are
  picked up by refresh-on-read polling.

### Showing the straight path and Newton paths side by side

Requirement: the straight (or hand-edited) path and the Newton path(s) must be visible at
the same time, or the user must be able to switch between them.

Problem: selecting a Newton path copies its geometry into `traverse.path`, which would
overwrite the manual path.

Fix: store the manual path separately in the doc.

```ts
interface Traverse {
  // ...
  path: AEGISPoint[] | null; // ACTIVE path (unchanged meaning for all consumers)
  activePathUuid?: string | null; // null = manual path is active
  manualPath?: AEGISPoint[] | null; // straight/hand-edited path, kept while a Newton path is active
}
```

- When a Newton path is selected, copy `path` into `manualPath` (if it isn't already
  saved) and write the Newton geometry into `path`.
- When the manual path is selected, restore `manualPath` into `path` and recompute the
  profile.
- Hand-editing while a Newton path is active edits the Newton copy. Save it as manual,
  clear `activePathUuid`, and keep `manualPath` as the user's edit.
- The watcher's stale reset falls back to `[start, end]` (or `manualPath` with its
  endpoints snapped) when the endpoints change.

The map draws:

- the active path in the normal style;
- the inactive manual path (`manualPath`, from the doc);
- the Newton candidates that apply to the current endpoints (from `GET /traversePath`,
  which is already polled).

Inactive paths get a secondary style, such as dashed or faded, and can be clicked to select.
Newton candidates never enter the doc unless selected. `manualPath` adds one small array per
traverse.

## Implementation plan

The steps below run in order. Each step ends with a **gate**: the conditions that must hold
before the next step starts. Every gate from step 1 onward also requires:

- Prettier on the changed files;
- `npm run test:all` green (lint, then `tsc`, build, vitest, and vitest browser).

Server tests follow the existing patterns:

- route and helper tests in `src/tests/vitest/express/`;
- listener tests modelled on `src/tests/vitest/dust/v1/sockets-dust-emitters.test.ts`, which
  mocks `getAutomergeDocListing` and uses in-memory docs;
- Automerge migration tests in `src/tests/vitest/server/automerge/`.

Newton is always mocked in CI. Tests against the live API are opt-in only.

### Baseline: live API on 2026-10-15

These are read-only checks against `https://jsxim-gisproc1.ndc.nasa.gov/api/v1`. On macOS,
curl needs `CURL_SSL_BACKEND=secure-transport`.

- **Health:** `/health` → `{"status":"ok","sha":"99deeaf","map_count":3}`.
- **Maps:**
  - `ms3_slope` and `ms3_elevation`: moon, 1 m/px, "Moon (2015) - Sphere / Ocentric /
    South Polar" stereographic, extent `[71470, 118030, 129310, 159820]` m;
  - `jsc_rockyard_elevation_2mpp`: earth, Web Mercator.
  - There are **no obstacle maps yet**, and only one lunar slope map.
- **Coverage:** the Apollo 14 seed mission (lat −3.6°, lng −17.5°) is **not** covered.
  Testing needs a south-pole mission whose stations fall inside `ms3`. One existing job planned
  between `[32.645, -84.206]` and `[34.367, -84.241]` (`[lon, lat]`).
- **That existing job:** `succeeded`, `runtime` 69 077 ms, and a `LineString` of **4 917 vertices**.
  It covers about 1.9° of longitude at −84.2°, roughly 5 km, so about one vertex per meter.
  Coordinates are `[lon, lat]`.
- **GET response keys:** `traverse_problem`, `method`, `status`, `runtime`, `path`,
  `map_info`. There is **no `request_hash` or `error` key**, and the echoed problem has no
  `vehicle`. The deployed build may predate the hash work; step 0 confirms this with a new job.
- **CORS:** `Access-Control-Allow-Origin: *`, with methods
  `GET, POST, PUT, DELETE, OPTIONS`. So a browser on the AEGIS dev origin can call Newton
  directly, which is what step 0 relies on.

Re-checked on 2026-10-26 (step 0): the sha is now `e1b43dc`. `request_hash`,
`effective_problem`, and `error` have shipped. The old job above now reports an unprefixed
`request_hash` and `effective_problem: null`, as documented for older jobs.

### Step 0: client-side spike against the live API (throwaway)

**Goal:** confirm Newton's real behaviour and AEGIS's assumptions, using the browser and
scripts only, before writing any backend code. Nothing from this step ships, and no table,
Automerge, or doc change is made.

Work:

1. **Script:** `scripts/newton-spike.ts` (run with `npx tsx`), or a `curl` checklist. It
   should:
   - run health and maps checks;
   - probe both endpoints of a chosen station pair;
   - POST `{planet: "moon", method: "astar", waypoints: [[lon, lat], [lon, lat]]}`;
   - poll the GET until the job finishes;
   - save the raw responses to `.local/newton-spike/` (gitignored).
2. **Probe each case once:**
   - **(a) a new pair:** expect `202`, and check whether `request_hash` is present;
   - **(b) the identical request again**, after (a) finishes: expect `"cached": true`, the same
     `traverse_id` and the same hash;
   - **(c) the identical request while (a) is still running:** expect a separate job today;
   - **(d) one waypoint outside `ms3`:** record the status code and body;
   - **(e) a waypoint on terrain steeper than the slope limit;**
   - **(f) `obstacle_maps` in the body:** expect `400`;
   - **(g) `DELETE` on a running job**, then `DELETE` again after it finishes (`409`).
3. **Dev-only browser harness**, not merged. On a local branch, add a temporary button in
   the traverse pane, or a console snippet. It should take the selected traverse's endpoints
   (`getTraverseEndpoints`), call Newton directly with `fetch` (CORS allows it), poll, and
   draw the result. Draw it as a temporary feature on the existing `traverseSource` with a
   dashed style, following `src/components/interface/map/CLAUDE.md`.
4. **Measure the profile cost.** Feed the returned path through the existing
   `POST /api/v1/terrainProfile` (via `thunkFetchTerrainProfile`). Do this both raw and
   after Douglas–Peucker at 0.5 m and 1 m tolerances. Record the sample counts, the latency,
   and whether the result stays under `MAX_RASTER_PROFILE_SAMPLES` (100 000).

**Gate:**

- [x] A south-pole test mission exists locally, with at least 3 stations inside `ms3`. Its
      projection matches `ms3` closely enough that the Newton path lines up with the stations
      and terrain when drawn. _Mission 50; the projections are identical. Terrain overlay
      not checked locally (see results)._
- [x] A new job shows whether `request_hash` is present and `v1:`-prefixed, and whether
      `error` appears on `failed`. If either is missing, record the Newton build sha and
      agree a deploy date with the Newton team. Steps 1–3 can go ahead while that's open.
      _Both are present._
- [x] Coordinate order (`[lon, lat]`) is confirmed. The path's first and last vertices are
      within 1 px (1 m) of the requested waypoints. The snapping tolerance used by the
      "applies" check and by `params_key` rounding is chosen from this; record the value.
      _At most 0.62 m. Rounding is 1e-7°; see results._
- [x] Status codes and error bodies for (d), (e), (f), and (g) are recorded in this doc. They
      decide which errors are terminal and which are retried in step 3.
- [x] Runtime is recorded for at least 3 traverses of different lengths. This sets the
      browser poll interval, the `last_polled_at` throttle, and the `NEWTON_MAX_IN_FLIGHT`
      default.
- [x] The simplification tolerance is chosen. The simplified path keeps the A\* detours,
      checked visually on the map, and stays well under the sample cap. Record the vertex
      reduction ratio. _Checked on offline plots in the mission CRS, not in the AEGIS map._
- [x] Findings are appended to this doc as "Step 0 results", and the spike branch is deleted.
      _There was no branch; the scripts live in `.local/newton-spike/`._

### Step 0 results (2026-10-26)

Run against the live server (sha `e1b43dc`, 3 maps) from Node scripts in
`.local/newton-spike/` (gitignored). Every raw request and response is saved in
`.local/newton-spike/raw/`. The test mission was read straight from the local Automerge DB,
read-only. No AEGIS code or document was changed.

#### Test data

- **Test mission: 50, "A03MP026 - ART Surface EVA MS 3".**
  - 69 of 71 stations are inside `ms3`.
  - Its projection is `IAU2000:30166`, which is `+proj=stere +lat_0=-90` on a 1 737 400 m
    sphere. That's the same projection as `ms3_slope`, so Newton paths and AEGIS stations
    share a CRS exactly.
  - Missions 51 (the training copy of 50), 24, 37, and 45 (A03N1014) are also inside `ms3`.
- **Traverse sizes.** Mission 50 has 89 as-planned traverses with located endpoints.
  - **34 are zero-length:** start and end are the same point, as in lander egress → first
    station.
  - The other 55 run from 6 m to 532 m and cover 32 distinct endpoint pairs. The longest
    station-to-station distance in the mission is 730 m.
  - All stored paths are straight lines or a few hand-drawn vertices (2–7).
- **Mission 50's DEM isn't available locally.** `mp2-sfs-dem_MoonSP_COG_deflate_cog.tif`
  isn't in `../aegis_static`, so `POST /api/v1/terrainProfile` couldn't be timed, and the
  terrain overlay couldn't be checked. Sample counts were computed offline with the route's
  own formula instead (see "Path geometry").

#### Probe results by case

| Case                                          | Result                                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) new pair, 100 m                           | `202 {traverse_id, request_hash: "v1:edb9…"}`. `in_progress` → `succeeded` after **89 s**, with 101 vertices.                                                                                                                       |
| (b) identical request after (a) finished      | `202 {cached: true, …}`, same hash, `traverse_id` of the **most recent** identical job (the one from (c), not (a)).                                                                                                                 |
| (b2) same body with `method` omitted          | Cached hit, same hash. The documented normalization works.                                                                                                                                                                          |
| (c) identical request while (a) was running   | A separate job with the **same hash**. Both ran the full ~90 s.                                                                                                                                                                     |
| (d1) one waypoint outside every slope map     | **`202` + hash**, then `failed` after 0.4 s: `"ArgumentError: no slope map registered for planet=moon that covers every waypoint"`. `map_info: []`, and no `slope_map` in `effective_problem`.                                      |
| (d2) both waypoints inside `ms3` but no route | `202`, then `failed` after **86 s**: `"ArgumentError: no traversable path between waypoint 1 and waypoint 2"`.                                                                                                                      |
| (e) `slope_limit: 0.5` (waypoints too steep)  | `202`, then `failed` after **80 s**: `"ArgumentError: one or more waypoints are not traversable: waypoint_1, (…), lies in an area where the slope exceeds the limit of 0.5 degrees; …"`.                                            |
| (f) `obstacle_maps` in the body               | `400 {"error": "ArgumentError: \`obstacle_maps\` is no longer supported; …"}`. Same pattern for `slope_buffer_px`, an unknown `method`, one waypoint, both slope buffers set, `turning_radius` with 3 waypoints, and an empty body. |
| (f2) an **unknown field** (`bogus: 1`)        | **Silently ignored:** a cached hit with the same hash as (a).                                                                                                                                                                       |
| (f3) `[lat, lon]` swapped                     | `202`, then `failed` after 20 ms (no covering slope map).                                                                                                                                                                           |
| (g) `DELETE` while running                    | `202 {"status": "cancelled"}`, but the job stayed **`in_progress` for another ~45 s** before ending `cancelled`. A second cancelled job (step 0's 20 000-waypoint body) ended **`failed`**, not `cancelled`.                        |
| (g2) `DELETE` after finishing                 | `409 {"error": "traverse already finished: <id>"}`.                                                                                                                                                                                 |
| (g3) re-POST after cancelling                 | A new job with the same hash, not a cached hit. Cancelled results aren't cached.                                                                                                                                                    |
| zero-length traverse (start == goal)          | `202`, then `failed` after **88 s**: `"ArgumentError: a Path LineString needs at least 2 points, got 1"`.                                                                                                                           |
| `GET` / `DELETE` on an unknown id or non-uuid | `404 {"error": "traverse not found: <id>"}`.                                                                                                                                                                                        |
| 378 KB body (20 000 waypoints)                | Accepted (`202`). No `413` at that size.                                                                                                                                                                                            |
| hash sensitivity                              | Moving one waypoint by **1e-12°** gives a **different hash** and a new job. The hash covers coordinates at full float precision.                                                                                                    |

#### Runtime and load

| Job                                       | Concurrent jobs | `runtime` |
| ----------------------------------------- | --------------- | --------- |
| 100 m (101 vertices)                      | 2               | 89–92 s   |
| 730 m (732 vertices), `slope_limit: 25`   | 2               | 93 s      |
| 5.4 km (4 917 vertices, older job)        | ?               | 69 s      |
| 385 m / 533 m / 730 m, plus 2 near-copies | 5               | 173–209 s |
| `failed`: no route, or waypoint too steep | 1–2             | 80–86 s   |
| `failed`: no covering slope map           | 1               | < 0.5 s   |

- **About 90 s per job, whatever the length.** Runtime seems to be a fixed per-job cost
  (map preparation). Path length barely matters. A job that fails on slope or routing pays
  the same cost.
- **Concurrency is limited.** Five jobs at once took about 2.2× as long each. Total
  throughput rose only from about 0.67 to about 1.4 jobs per minute.
- **Newton stops answering under load.** With 5 jobs running:
  - `GET /traverses/:id` took 10–20 s;
  - five GETs hung for 60 s and came back as **Apache `502 Proxy Error` HTML pages**, not
    JSON;
  - `POST` took 20–23 s instead of about 0.25 s.

  With 1–2 jobs running, GETs answered in about 60 ms.

#### Path geometry

- **Paths are 8-connected pixel steps:** 1 m and 1.41 m on the 1 m map.
  - 78–87 % of the vertices are collinear.
  - Paths are 9–14 % longer than the straight line.
  - The plotted paths in the mission CRS follow the straight line with visible detours,
    as expected.
- **Endpoints are snapped to pixel centres** (`x.5` in projected meters).
  - First and last vertices are **0.24–0.62 m** from the requested waypoints.
  - The older 5 km job is 1.36–1.39 m off, at whole-meter vertices from an earlier build.
  - The path never starts or ends exactly on the station.
- **Simplification.** Douglas–Peucker in projected meters:

  | Path   | Raw vertices | 0.01 m (removes collinear only) | 0.5 m | 1 m | Terrain samples, raw → 0.5 m |
  | ------ | ------------ | ------------------------------- | ----- | --- | ---------------------------- |
  | 100 m  | 101          | 23                              | 18    | 11  | 259 → 135                    |
  | 385 m  | 374          | 68                              | 57    | 40  | 994 → 505                    |
  | 533 m  | 485          | 77                              | 56    | 38  | 1 348 → 672                  |
  | 730 m  | 732          | 134                             | 102   | 75  | 1 964 → 994                  |
  | 5.4 km | 4 917        | 649                             | 547   | 371 | 13 640 → 6 864               |
  - Path length drops by 0–0.6 % at 0.5 m and by up to 1.3 % at 1 m.
  - Even the raw 5 km path is far under `MAX_RASTER_PROFILE_SAMPLES` (100 000).
  - The route's `max(2, ceil(d / res) + 1)` per segment makes raw paths cost about twice
    the samples of their simplified versions.

- **Size.** A raw 5 km path is about 120 KB of GeoJSON, which is fine for JSONB.

#### Browser access (CORS)

These checks ran in headless Google Chrome (Playwright, `channel: "chrome"`):

- **Page served from a real `127.0.0.1` server:** `GET /health` and `POST /traverses` both
  succeeded.
- **Pages whose origin wasn't served from a loopback or private address**
  (`https://aegis-local.fit.nasa.gov` and `http://localhost:3000`, both stubbed by
  Playwright): blocked. Chrome reported _"Permission was denied for this request to access
  the `local` address space"_.
  - This is Chrome's **Local Network Access** check. Newton resolves to `10.234.138.79`, a
    private address, and doesn't send `Access-Control-Allow-Private-Network`.
  - In normal Chrome it shows a permission prompt instead.

Calling Newton from the browser therefore depends on where AEGIS is served from and on
the browser, which is one more reason to keep every call on the server. Step 0's
in-app harness was not built, because there are no code edits in this phase. The plots
replaced it.

#### Inconsistencies with the documented API

Reported here for the Newton team.

1. **Errors the docs list as `400` come back as `202` and fail asynchronously.** The
   `TraverseProblem` section says a `400` is returned when no slope map covers the
   waypoints, when a waypoint isn't traversable, or when no path exists. All three actually
   return `202` with a `request_hash`, then end in `failed` with `error`. Only schema
   problems are a synchronous `400`.
   - The "Request hash" section ("Requests rejected with a `400` … get neither") is accurate
     only for schema `400`s.
   - Failed jobs do get a hash, and when no slope map was selected that hash has no
     `slope_map` in its input.
2. **The error model differs from the docs.**
   - The docs say every error is `{"error": {"code", "message", "details"}}`.
   - The actual `400`, `404`, and `409` bodies are `{"error": "<string>"}`, usually prefixed
     with a Julia exception type (`"ArgumentError: …"`).
   - The GET `error` on a `failed` job is a plain string too.
   - Proxy failures are HTML.
3. **Probing by point returns no maps.** `GET /traverses/maps/probe?planet=moon&lon=&lat=`
   returns `{"maps": []}` for every point tried, including:
   - points inside `ms3` that plan successfully;
   - the `ms3` centre;
   - the docs' own example.

   Probing by extent (`extent=…&crs=ESRI:103878` or `IAU_2015:30135`) does return
   `ms3_slope` and `ms3_elevation`. The point form looks broken.

4. **Unknown body fields are silently ignored.** A typo such as `slope_limt` would plan with
   the default and hash as if the field weren't there. The docs don't say either way.
5. **`DELETE` returns `{"status": "cancelled"}` before the job stops.** The job runs on for
   up to about 45 s, and can still end `failed` (seen once) or possibly `succeeded`. The docs
   say planning stops "at its next check". In practice the fixed per-job cost isn't
   interruptible.
6. **Zero-length requests aren't validated up front.** `waypoints` with start == goal is
   accepted, runs about 88 s, then fails with an internal-sounding
   `"a Path LineString needs at least 2 points, got 1"`.
7. **Overload shows up as proxy `502`s.** The Apache proxy in front of Newton times out at
   about 60 s. While Newton is busy, `GET` (and sometimes `POST`) hits that timeout and returns
   HTML. The documented error list doesn't mention `502`/`504`.
8. **Nothing marks the cached job.** `cached: true` returns the newest succeeded identical
   job, not the first. Harmless, but a stored `traverse_id` can differ from another
   caller's for the same hash.
9. **The docs' example probe point (`lon=-80, lat=-89`) and waypoints (`cr_g2` map) aren't
   registered on this server.** Expected for a local config, but worth flagging.

What matches the docs:

- `obstacle_maps` and `_px` buffers return `400`;
- `method` normalization;
- `effective_problem` contents (no `obstacles` key without obstacle maps);
- `map_info` is filled while the job is `in_progress`;
- `error` appears only on `failed`;
- `409` on cancelling a finished job;
- cancelled results aren't cached;
- `v1:` hashes on new jobs, and an unprefixed hash on the older job.

#### Plan changes from step 0

These change the steps below. Where an earlier design section conflicts, these win.

- **Step 1 (client):**
  - Parse **three error shapes:** the documented object model, `{"error": "<string>"}`, and
    non-JSON (HTML).
  - Classify these as **transient**:
    - `502`, `503`, `504`;
    - a timeout;
    - a network error;
    - a non-JSON body.
  - Use a request timeout of about 65 s, just above the proxy's.
  - Build POST bodies from a **whitelist** of fields, because Newton ignores typos.
- **Rounding and `params_key`:**
  - Round waypoints to **1e-7°** (≤ 1.1 cm in latitude, ≤ 2 mm in longitude at −84°).
  - **Send the rounded values to Newton**, so Newton's cache hits whenever `params_key`
    matches.
  - The "applies" check compares the stored rounded request endpoints with the traverse's
    current endpoints rounded the same way, exactly. It never compares against path vertices.
- **Step 3 (job service):**
  - **Refresh-on-read must not block.** A Newton GET can take 60 s under load.
    `GET /api/v1/traversePath` returns the stored rows immediately and starts a background
    refresh. Clients see the update on their next poll.
  - `POST /api/v1/traversePath` likewise returns the `submitting` row without waiting for
    Newton.
  - **Default `NEWTON_MAX_IN_FLIGHT` to 1**, server-wide, not per mission. Newton degrades
    badly with 5 jobs, and other clients share it.
  - The `last_polled_at` throttle is ≥ 10 s, and the browser poll interval is 10 s while any
    row is unfinished.
  - **Dedupe in flight across traverses.** Before POSTing, look for a row anywhere with the
    same rounded endpoints and parameters (any mission, any `refUuid`) that is
    `submitting`/`pending`/`in_progress`. If one exists, wait and reuse its result rather
    than starting a duplicate job. Newton only dedupes after a job succeeds, and identical
    concurrent jobs each pay about 90 s.
  - **Errors:**
    - A `failed` job with an `ArgumentError` is terminal. Show the message with the
      `ArgumentError: ` prefix stripped.
    - Never retry a `failed` job automatically.
  - **`DELETE` follow-up:** after a `202`, keep the row and keep polling until the job is
    finished. Accept `failed` or `succeeded` as the final state.
- **Step 4 (watcher):**
  - **Skip traverses whose rounded endpoints are less than 1 slope-map pixel apart (1 m).**
    In mission 50 that's 34 of 89 traverses, each of which would otherwise burn 88 s on
    Newton and then fail.
  - **Backfill is expensive.** At about 90 s per job with 1 in flight, mission 50's 32
    distinct pairs take about 48 min, and its 55 traverses would take about 80 min without
    the cross-traverse dedupe. Across every lunar mission that's days.
    - **Default `NEWTON_AUTO_BACKFILL` to off.**
    - Plan a per-mission opt-in, or a "request paths for this EVA" action
      (`POST /api/v1/traversePath/eva`).
  - **Coverage check before submitting.** With probe-by-point broken, check coverage
    AEGIS-side:
    - cache `GET /traverses/maps?type=slope&planet=moon` (refresh about hourly);
    - test both endpoints against each map's `extent` in its `crs` with proj4;
    - skip uncovered traverses without calling Newton.

    Store no row for these; the UI says "outside Newton coverage" from the same check. If
    Newton fixes the probe, it can be used instead.
- **Stale-path window:** at least about 90 s, and minutes under load, not seconds. The reset
  in step 8 stays the safety net.
- **Step 7 (selection):**
  - Simplify with **Douglas–Peucker at 0.5 × the slope map's resolution** (from
    `map_info`), in the **mission's projected CRS** (`projProj4String`), never in degrees.
    That's 0.5 m on `ms3`, which removes about 85 % of vertices and changes length by under
    1 %.
  - Then **replace the first and last vertices with the exact station locations.** Newton
    snaps them to pixel centres, and AEGIS expects `path[0]` and `path.at(-1)` to be the
    stations.
- **Test fixtures:**
  - Mocked-Newton tests should replay the saved raw responses: string errors, HTML `502`s,
    a `202` followed by `failed`, and the cancel that keeps running.
  - The live smoke test (step 1) should use mission 50's "Geology Tools Demo" →
    "Auxiliary EVA Sys Demo" pair (100 m, `v1:edb959cf…`). It is cached on Newton, so it
    returns instantly.

### Step 1: Newton client, wire types, conversion (server only)

Work:

- **Client module.** Replace the stub in `src/server/newton/http-newton.ts` with `health`,
  `probeMaps`, `postTraverse`, `getTraverse`, and `cancelTraverse`.
  - Read the base URL from `NEWTON_BASE_URL`, with a per-request timeout.
  - Return typed results that distinguish `accepted`, `cached`, `deduplicated`, `transient`
    (`503` or network), and `rejected` (`400`/`413`/`422` and other `4xx`, with Newton's
    error body).
- **Types.** Ambient types for the Newton wire format go in `src/server/newton/types/newton.d.ts`.
  Don't export them.
- **Conversion.** `src/server/newton/convert.ts` converts between `AEGISPoint` and
  `[lon, lat]` and GeoJSON, and builds the `TraverseProblem` (`planet: "moon"`,
  `method: "astar"`, nothing else).
- **Hash helper.** Add `isComparableHash(hash)`, which accepts only `v1:` values.

**Gate:**

- [ ] Unit tests with a mocked `fetch`:
  - each response class above;
  - a timeout is treated as transient;
  - a GeoJSON round trip;
  - the request builder never emits `obstacle_maps` or `_px` buffers;
  - `isComparableHash` rejects `null`, unprefixed, and `v2:` values.
- [ ] An opt-in live smoke test (`NEWTON_LIVE=1 npx vitest run .../newton.live.test.ts`)
      passes `health` and `probeMaps` against the real server. It is excluded from
      `test:all`.

### Step 2: `traverse_path_db` table and mission lifecycle

Work:

- **Model and migration.** Add the MikroORM model `traverse_path.model.ts` with the columns
  from "Table: `traverse_path_db`" (including `params_key`, `request_hash`,
  `newton_deduplicated`, `submit_attempts`, and the `submitting` status). Register it in
  `_allModels.ts` and add a migration in `src/server/database/migrations/`.
- **Indexes:**
  - unique `(mission_id, traverse_ref_uuid, params_key)`;
  - plain `(mission_id, traverse_ref_uuid)`;
  - plain `request_hash`;
  - partial `status IN ('submitting','pending','in_progress')` for refresh lookups.
- **Lifecycle.** Rows are deleted in `deleteMissionRelatedEntities`, copied in
  `createMissionCopy` (`src/utils/dup/core.ts`), and included in mission dump/import
  (`MissionSourceData`, `fetchMissionSourceData`).

**Gate:**

- [ ] `npm run migration:up` and `migration:down` both run cleanly on a fresh DB and on a
      DB with existing missions.
- [ ] Tests:
  - inserting the same `params_key` twice fails on the second insert, as the conflict path
    expects;
  - mission delete removes the rows;
  - duplicate copies them with new `uuid` and `mission_id`;
  - dump includes them;
  - existing dup tests (`missionDup.test.ts`) still pass.

### Step 3: job service and REST routes (refresh on read)

Work:

- **Job service.** `src/server/newton/traversePathJobs.ts`:
  - `submitTraversePath(missionId, scopeEntry, params)`: idempotent insert in
    `submitting`, POST through the limiter (`NEWTON_MAX_IN_FLIGHT`), then store the id,
    hash, and the `deduplicated` flag.
  - **Transient errors** (`503`, network): stay in `submitting` with backoff, up to about
    5 attempts.
  - **Terminal errors:** set `failed`.
  - `refreshRows(rows)`: throttled by `last_polled_at`, saved under the `version` lock.
    It also resubmits rows stuck in `submitting`.
- **Routes.** `src/server/express/routes/traversePath.ts`, registered in the router:
  - `POST /`
  - `POST /eva`
  - `GET /`
  - `GET /:uuid`
  - `DELETE /:uuid` (never cancels rows with `newton_deduplicated` set)
  - `GET /probe`

  All go through `hasPerms`, which also accepts `EMSS_TOKEN`, and all return
  `WrappedResponse<T>`.

- **Browser wrappers.** Add `src/http-client/traversePath.ts`.

**Gate:**

- [ ] Route tests with a mocked Newton client:
  - `401` without a session or token, and success with `EMSS_TOKEN`;
  - `cached: true` finishes the row in the POST;
  - pending → succeeded across two GETs;
  - `failed` stores Newton's `error`;
  - `503` leaves the row in `submitting` and a later GET resubmits it;
  - `400` → `failed`;
  - `DELETE` on a deduplicated row makes no Newton call;
  - two concurrent GETs finish the row exactly once;
  - a GET within the throttle window makes no Newton call.
- [ ] Manual check against the live Newton, using the step 0 test mission: `curl` AEGIS
      `POST /api/v1/traversePath` for a real traverse, then poll `GET` until `succeeded`. The
      stored `path` matches what Newton returns directly.

### Step 4: server-side endpoint watcher (automatic requests)

Work:

- **Snapshot builder.** `src/server/newton/traverseEndpointSnapshot.ts` is a pure function
  over a `Mission`, using `getTraverseEndpoints` and `getSequenceTraverseUuids`.
  - It covers the as-planned scope and every REX scope.
  - It skips blank or unlocated endpoints.
  - It applies the rounding chosen in step 0.
- **Watcher.** `src/server/newton/traversePathWatcher.ts` holds its state in
  `globalValues.newton`.
  - It attaches to all non-archived missions at boot and in `createAutomergeMission`.
  - It detaches on delete, on archive, and in `gracefulShutdown`.
  - It uses a placeholder guard against concurrent attaches, and a trailing debounce of
    about 3 s with a `maxWait` of 30 s.
  - It diffs snapshots and calls `submitTraversePath` with the automatic parameter set.
- **Flags.** `NEWTON_AUTO_REQUESTS` turns the watcher on or off. `NEWTON_AUTO_BACKFILL`
  controls whether every entry is submitted on attach.

**Gate:**

- [ ] Snapshot tests (pure):
  - a blank traverse and an unlocated station are skipped;
  - choosing a station in an empty slot (`thunkDocChangeStationInEva`) → 2 changed entries;
  - a reorder → 3;
  - a lander move → every lander-adjacent traverse;
  - a delete → none (removal is not a change);
  - a REX copy at the same endpoints → the same `params_key`.
- [ ] Watcher tests:
  - several changes inside the debounce window produce one flush;
  - detach cancels a pending flush;
  - concurrent attach installs exactly one listener;
  - a server-side write that doesn't change endpoints submits nothing;
  - backfill submits only what's missing (running it a second time is a no-op).
- [ ] Manual check in the dev UI with the test mission: add a station to an EVA and pick a
      location. Within about 5 s, two rows appear (`GET /api/v1/traversePath`), and a
      second browser sees them too. Dragging a station repeatedly produces one row per
      settled position, not one per drag frame.
- [ ] With `NEWTON_AUTO_REQUESTS=false`, nothing is submitted.

### Step 5: doc schema (`activePathUuid`, `manualPath`)

Work:

- **Type.** Add `activePathUuid?: string | null` and `manualPath?: AEGISPoint[] | null` to
  `Traverse` (`src/typings/itinerary.d.ts`), then run `npm run schema:create`.
- **Migration.** Add an Automerge migration that back-fills both fields to `null`
  (following `Migration20260902000000`) and register it in `migrations/index.ts`.
- **Duplication.** `stageDuplicateTraverse` and `applyDuplicateTraverse` clear
  `activePathUuid` when the `refUuid` is **not** preserved (a plain duplicate), and keep it
  for a REX copy.

**Gate:**

- [ ] `migrationRegistry.test.ts` passes with the new entry. The migration is idempotent:
      running it twice changes nothing.
- [ ] `npm run automerge:validate` and `npm run automerge:integrity` pass on a local DB with
      seeded and real missions.
- [ ] Duplication tests: a REX copy keeps `activePathUuid`, and a plain duplicate clears it.
- [ ] Maestro and DUST payload tests are unchanged. Neither contract file was edited.

### Step 6: client display (straight and Newton paths side by side)

Read `src/components/interface/map/CLAUDE.md` first.

Work:

- **Polling hook.** Fetch rows for the visible EVA's traverse `refUuid`s, and poll every N s
  (N chosen in step 0) only while some row hasn't finished.
- **"Applies" filter.** A row applies when its stored endpoints match the traverse's
  current endpoints, within the step 0 tolerance.
- **Map behaviour.** Draw the inactive candidates (`manualPath`, plus applying Newton rows)
  in a secondary dashed style next to the active `traverse.path`. Group candidates with the
  same comparable `request_hash`.
- **Traverse pane.** List the candidates with status, the slope and obstacle maps (from
  `map_info`), runtime, and error.
- **No auto-select.** The straight line stays active when a Newton row finishes.

**Gate:**

- [ ] Browser tests (vitest browser): candidate rows render on the map and in the pane; a
      row with stale endpoints is hidden; polling stops once all rows have finished; a
      `failed` row shows its error.
- [ ] Manual check: on the test mission, the straight line and the Newton path are visible
      together and match the step 0 harness. Closing the tab that triggered the job and
      opening another one still shows the result.
- [ ] Dashboard and minimap are unaffected, unless candidates are deliberately shown there.

### Step 7: selecting a path

Work:

- **Thunk.** `thunkDocSelectTraversePath({ traverseUuid, pathUuid | null })`:
  1. Convert the row's GeoJSON and simplify it with the step 0 tolerance.
  2. Save `path` into `manualPath` when switching away from manual.
  3. Run `stageTraverseUpdate` with `overrides.path`.
  4. Write one `.change()` through a new `applySelectTraversePathStage` in
     `apply-traverse.ts`.

  Selecting `null` restores `manualPath`.

- **Hand edits.** Hand-editing while a Newton path is active saves the edit as manual and
  clears `activePathUuid`.

**Gate:**

- [ ] Stage and apply tests:
  - selecting a Newton path writes `path`, `pathSegment*`, `activePathUuid`, and
    `manualPath` in one change;
  - switching back restores the original manual path exactly;
  - two selections in a row don't overwrite `manualPath`;
  - a path over the sample cap is simplified, or rejected with a user-facing error.
- [ ] Manual check: after selecting a Newton path, the timeline duration, distances, slope
      legend, Maestro calculated fields, and DUST output all reflect it. Switching back
      reverts every one of them.

### Step 8: stale reset at the watcher

Work:

- **Reset.** When the watcher sees an endpoint change under a traverse whose `activePathUuid`
  row no longer applies:
  1. Compute a straight path (or `manualPath` with its endpoints snapped), its distances,
     and its profile, using `readTerrainProfileInWorker`.
  2. Re-read the doc.
  3. Apply `applyClearActiveTraversePath` in one `handle.change()`.
- **Skip.** If the endpoints moved again in the meantime, don't apply.

**Gate:**

- [ ] Tests:
  - the reset only happens when the active row stops applying;
  - moving a station back before the debounce flushes does nothing;
  - the reset write doesn't trigger another reset or submission;
  - a REX and an as-planned traverse sharing a `refUuid` are reset independently.
- [ ] Manual check: with a Newton path active, dragging a station shows the snapped A\* path
      briefly (the accepted stale-path window), then the reset to the manual or straight
      path. The new Newton candidate for the new position then appears.

### Step 9: rollout hardening

Work:

- **Logging.** `serverLogger` entries under a `newton` logId cover submit, refresh, retry,
  failure, and reset, with counts.
- **Metrics (optional).** Expose in-flight and pending counts through the existing metrics
  route.
- **Config.** Add `NEWTON_BASE_URL`, `NEWTON_AUTO_REQUESTS`, `NEWTON_AUTO_BACKFILL`, and
  `NEWTON_MAX_IN_FLIGHT` to the deployment env and `docker-compose.yml`.
- **Docs.** Update `CLAUDE.md` to cover the new table, the watcher, and the REST routes.
- **E2E.** A Playwright spec with Newton stubbed (route interception, or a stub server).
  It should create an EVA, add a station, see the candidate, select it, switch back, and
  move the station.

**Gate:**

- [ ] `npm run test:playwright` passes with the new spec.
- [ ] Staging soak:
  - backfill on a copy of production missions finishes without exceeding
    `NEWTON_MAX_IN_FLIGHT`;
  - no rows stay in `submitting` or `pending` longer than the longest observed runtime plus
    the retry budget;
  - API memory and event-loop lag stay within normal ranges with every mission's watcher
    attached.
- [ ] A restart in the middle of a job (stop apiv1 while rows are `pending`) loses nothing.
      The next GET finishes the rows.
