# QuickMap URL Adapter and ACT Integration Plan

**Status:** Q0 panel linking implemented; partnership and accuracy gates remain
**Date:** 2026-08-08
**Scope:** External LROC QuickMap companion-window integration for AEGIS

This document splits the QuickMap-specific work from the [3D Lunar Map Prototype Research and Implementation Plan](3D-MAP-PROTOTYPE-PLAN.md). It owns the URL adapter, popup lifecycle, and the cross-window API request to Applied Coherent Technology (ACT).

## Implementation Status (2026-08-08)

Completed for the initial companion-window integration:

- Added environment-configured QuickMap host, layer IDs, and default resolution.
- Added a pure URL adapter with coordinate validation/normalization, point/line/polygon encoding, deliberate polygon closure, and a 7,000-character URL budget. The result reports included and omitted geometry counts to callers.
- Added `View in QuickMap` actions to the EVA, station, and traverse information panels. Each opens or focuses the named external `aegis-quickmap` window from the user click.
- EVA links center on the lander and include a white lander marker, every EVA sequence station, non-lander ingress/egress station, and EVA traverse. Duplicate station UUIDs are sent once.
- Station and traverse links center on the selected station or first valid traverse coordinate and include the selected geometry.
- Added unit coverage for URL encoding, the antimeridian and south pole, polygon closure, malformed lines, and URL-budget omission.

The supported URL contract carries station and traverse names as feature metadata, but it does not provide a supported mapping for AEGIS emoji station icons. EVA stations therefore appear as QuickMap's standard point markers; icon transfer requires an ACT-supported feature styling API.

The standalone `Open QuickMap 3D` command, measurement links, visible omitted-feature feedback, E2E popup assertion, ACT messaging API, and Q1 accuracy/operations gates remain planned work.

## 1. Decision and Scope

AEGIS should implement QuickMap as a separate-window companion first:

- Open LROC QuickMap in a named browser window using its supported URL contract.
- Send the lander location, scale, selected lunar layers, and a bounded set of AEGIS points, lines, and polygons in the URL.
- Label the view as external and one-way. URL navigation does not provide live cursor, camera, time, selection, or edit synchronization.
- Keep native Cesium as the controlled product path unless QuickMap passes the accuracy, operations, and integration gates in this document.

QuickMap can become a release solution instead of only a companion tool if all of these are true:

- ACT supports a versioned `postMessage`/`MessageChannel` API for popup windows.
- The API can set and report camera, UTC time, cursor, selection, and styled GeoJSON features with stable AEGIS UUIDs.
- AEGIS edits made in QuickMap can be reported back as geometry events, or 3D remains explicitly read-only.
- QuickMap terrain at mission 50 is validated against the mission DEM and the required vertical datum, resolution, and horizon accuracy.
- Operations accepts the external-service dependency, network requirements, data handling, availability expectations, parameter/version stability, and support arrangement.

If any of those fail, QuickMap remains a valuable `Open in 3D` command while native Cesium remains the release path.

## 2. Research Findings

The live LROC QuickMap runtime was inspected on 2026-08-07.

- It loads Cesium and a custom QuickMap Cesium view.
- Its whole-Moon terrain is served as Cesium quantized-mesh `.terrain` pyramids with `layer.json` manifests. The live app requested both full equidistant-cylindrical and polar-shifted stacks through level 15.
- It has custom orbit/navigation controls, terrain toggles, time controls, Sun/Earth geometry, terrain shadows, cursor coordinates, drawing, vector import, and permalink state.
- Public documentation supports GeoJSON, CSV, and Shapefile import. GeoJSON coordinates are interpreted as lon/lat on the active ellipsoid.
- Public drawing tools support points, paths, polygons, coordinate editing, profile charts, and data queries.
- The team-provided QuickMap Linking Guide adds a supported URL contract for projection, center, resolution, feature geometry, and layer stack.
- The live app accepts comma-delimited coordinates per feature and rewrites each feature with an internal generated ID. Optional `@@` metadata is preserved as feature properties.
- Public bundles contain worker `postMessage` traffic and a same-origin reload channel, but no documented cross-origin host-control API was found.
- Both `quickmap.im-ldi.com` and `quickmap.lroc.im-ldi.com` currently send `X-Frame-Options: sameorigin` and `Content-Security-Policy: frame-ancestors 'self'`. AEGIS cannot embed either host in an iframe today.

QuickMap is therefore immediately viable as a separate-window companion and potentially viable as a tightly integrated renderer if ACT adds a supported messaging bridge.

## 3. Supported URL Contract

The team-provided linking contract is:

| Parameter                   | Meaning                              |
| --------------------------- | ------------------------------------ |
| `proj=22`                   | 3D lunar globe                       |
| `proj=27`                   | South polar stereographic 2D         |
| `proj=16`                   | Equidistant cylindrical 2D           |
| `center=lon,lat`            | Initial center in degrees            |
| `resolution=metersPerPixel` | Initial scale                        |
| `features=...`              | Optional point/line/polygon geometry |
| `stack=id1,id2,...`         | Optional internal QuickMap layer IDs |

The currently supplied layer IDs are:

- WAC basemap: `66`
- Controlled Polar NACs: `3921`

These IDs are internal and must be configuration, not source constants. The currently canonical host appears to be `https://quickmap.lroc.im-ldi.com/`; the emailed guide uses `https://quickmap.im-ldi.com/`. AEGIS configures the base URL, layer IDs, and resolution with `VITE_QUICKMAP_BASE_URL`, `VITE_QUICKMAP_LAYER_IDS`, and `VITE_QUICKMAP_RESOLUTION_METERS_PER_PIXEL`; the production values still need ACT confirmation before release.

`features` encoding:

- Coordinates are `lon,lat` degrees.
- Features are separated by `|`; every feature is a comma-delimited sequence of coordinates.
- One coordinate pair is a Point.
- Two or more coordinate pairs are a LineString.
- A closed coordinate list is a Polygon.

## 4. Pure URL Adapter

Add a pure adapter with no browser side effects:

```typescript
interface QuickMapLinkState {
  center: AEGISPoint;
  resolutionMetersPerPixel: number;
  layerIds: string[];
  geometries: Array<
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][] }
  >;
}

function buildQuickMapLink(
  baseUrl: string,
  state: QuickMapLinkState
): { url: URL; includedGeometryCount: number; omittedGeometryCount: number };
```

Implementation rules:

- Build with `URL` and `URLSearchParams`, never string concatenation.
- Validate finite numbers and latitude bounds.
- Normalize longitude to the convention agreed with QuickMap.
- Keep full numeric precision in the adapter; round only to an agreed URL precision.
- Preserve geometry boundaries with `|` before URL encoding.
- Reject malformed lines with fewer than two distinct points.
- Close polygon rings deliberately; do not infer closure from rounded coordinates.
- Apply a conservative URL budget and return omitted feature counts to the caller.
- Prioritize lander, current selection, active EVA sequence, measurements, then other visible items when the budget is exceeded.
- Do not include mission geometry in a URL until its logging/history/privacy implications are accepted.

The adapter should have unit coverage for URL encoding, geometry boundaries, the URL budget, coordinates near `-180/180`, and the south pole.

## 5. Launch and Popup Lifecycle

AEGIS can immediately expose these commands:

- **Open QuickMap 3D:** lander center, default resolution, WAC, and controlled NAC layers.
- **View selected EVA in QuickMap:** from the EVA information panel, center on the lander and send every sequence station, non-lander ingress/egress station, and traverse.
- **View selected station in QuickMap:** from the station information panel, center on and send the selected station.
- **View selected traverse in QuickMap:** from the traverse information panel, center on the first valid coordinate and send the selected traverse.
- **Refresh QuickMap:** re-navigate the named window with a newly generated URL after an explicit user command.

Example launch path:

```typescript
const quickMapWindow = window.open(
  buildQuickMapUrl(baseUrl, state),
  "aegis-quickmap",
  "popup,width=1440,height=900"
);
quickMapWindow?.focus();
```

The initial `window.open` must run directly from a user gesture to avoid popup blocking. A later explicit sync command can assign a new URL to the existing cross-origin window and focus it. Do not navigate it on every cursor or Automerge change; each URL update reloads QuickMap and loses transient interaction state. The initial implementation uses the browser's named-window behavior to reuse and focus `aegis-quickmap`; no window reference is stored in Redux.

## 6. Camera and Current Limitations

The documented `center` + `resolution` contract opens a useful 3D view but does not guarantee a 2 m lander observer or a heading/pitch.

QuickMap permalinks visibly use a `camera` parameter containing Cartesian position, direction, up vector, and field of view. That parameter was observed in the live app but is not in the provided linking guide. Do not depend on its private format for release without ACT confirming it as stable.

Ask ACT for one of:

1. A documented `observer=lon,lat,height`, `heading`, `pitch`, and `fov` URL contract; or
2. A `setCamera` message in the cooperative API below.

For an experimental spike only, a spherical Moon-fixed camera can be generated from mission longitude, latitude, elevation, eye height, and an ENU heading. The implementation must be validated against a QuickMap-generated permalink before use.

URL-only linking cannot satisfy these release requirements:

- Continuous OpenLayers-hover marker in QuickMap.
- Continuous QuickMap-hover marker in OpenLayers.
- Smooth camera or time synchronization.
- Stable feature UUIDs, names, per-feature styles, visibility updates, or incremental changes.
- Reading QuickMap camera, selection, or time back into AEGIS.
- Persisting QuickMap geometry edits to Automerge.
- Avoiding URL/history/server-log exposure of feature coordinates. Security review is required before mission geometry is sent.
- Reliably sending large missions; URL size is finite and intermediary limits vary.
- Guaranteeing service availability, data versions, or layer ID stability.

QuickMap can manually draw and import vectors, but a user edit in that external app is not an AEGIS edit until a supported return channel exists.

## 7. Cooperative Popup API Requested from ACT

An iframe is unnecessary once a popup API exists. Keep QuickMap in its own window and exchange messages with strict origins.

Handshake:

```text
AEGIS -> QuickMap: aegis.quickmap.hello { protocolVersion, aegisOrigin }
QuickMap -> AEGIS: aegis.quickmap.ready { protocolVersion, capabilities }
```

Minimum commands from AEGIS:

```text
setView       { center, resolution } or { observer, heading, pitch, roll, fov }
setTime       { utc }
setFeatures   { revision, featureCollection }
setCursor     { lng, lat, height? }
setSelection  { uuid? }
fitFeatures   { uuids }
```

Minimum events from QuickMap:

```text
viewChanged      { camera, center, resolution }
timeChanged      { utc }
cursorChanged    { lng, lat, height? }
selectionChanged { uuid? }
featureEdited    { uuid, geometry, revision }
error            { commandId, code, message }
```

Protocol requirements:

- Use an explicit version and capability negotiation.
- Check `event.origin` exactly on both sides.
- Check `event.source` against the stored popup.
- Prefer a transferred `MessageChannel` after the initial handshake.
- Never accept executable strings or HTML.
- Use GeoJSON with stable AEGIS UUIDs and a documented style subset.
- Include monotonically increasing revisions to reject stale edits.
- Throttle cursor/view events and coalesce feature updates.
- Define ownership: AEGIS remains authoritative for mission entities.
- Define close/reconnect behavior and incompatibility errors.

## 8. Spike Acceptance Criteria

- A user click opens or focuses one named QuickMap window.
- Mission 50 opens in 3D at the lander with configured WAC/NAC layers.
- The active EVA's stations and traverses are visible.
- Points, lines, and polygons survive URL encoding and QuickMap's internal permalink rewrite.
- The adapter respects its URL budget and reports omitted items.
- No popup opens during page load or without a direct user action.
- A unit test covers coordinates near `-180/180` and the south pole.
- An E2E test asserts the popup URL; it does not attempt cross-origin DOM access.
- The UI labels the view as an external QuickMap window and does not imply edits are synchronized.

## 9. Implementation Phases

### Phase Q0: QuickMap Link Adapter

- [x] Add configured QuickMap base URL, layer IDs, and default resolution.
- [x] Add URL/geometry adapter with unit tests and URL budget.
- [x] Add external QuickMap actions to EVA, station, and traverse information panels.
- [x] Default links to `proj=22` with WAC + controlled NAC layers.
- [x] Add all selected EVA stations/traverses, including non-lander ingress/egress stations.
- [x] Label the action as an external, one-way companion view in its tooltip.
- [ ] Add a standalone `Open QuickMap 3D` command, measurement payloads, visible omitted-feature feedback, and an E2E popup URL assertion.

Exit: mission 50 opens reliably with the expected features and no iframe.

### Phase Q1: QuickMap Accuracy and Partnership Gate

- Compare QuickMap terrain heights and skyline fixtures to mission 50/LOLA.
- Confirm canonical host, layer IDs, URL compatibility guarantees, and support contact.
- Request supported ground-observer camera and UTC parameters.
- Request the popup message protocol in section 7.
- Resolve operational availability, analytics, data privacy, terms, attribution, and SLA.

Exit: decide whether QuickMap is companion-only or a candidate release renderer.

## 10. Questions for ACT Before Release

- Which host is canonical for supported links?
- Are projection/layer IDs and URL parameters versioned or covered by a compatibility policy?
- Can ACT add documented observer camera and UTC link parameters?
- Can ACT add the popup message protocol?
- Can imported features carry caller-provided IDs, labels, styles, and altitude?
- Can QuickMap report edits without becoming authoritative for AEGIS entities?
- Which DEM supplies mission 50 terrain, at what resolution/datum, and with what update cadence?
- What ephemeris/frame/kernel sources drive Sun/Earth and terrain shadows?
- What service availability, support, attribution, analytics, and data-retention terms apply?

## 11. References

- [LROC QuickMap](https://quickmap.lroc.im-ldi.com/)
- [QuickMap user guide](https://docs.quickmap.io/)
- [QuickMap vector import](https://docs.quickmap.io/map/import)
- [QuickMap drawing tools](https://docs.quickmap.io/toolbar/2-query)
- [QuickMap permalink guide](https://docs.quickmap.io/toolbar/4-permalink)
- [QuickMap lunar examples](https://www.actgate.com/examples/lroc-quickmap)
