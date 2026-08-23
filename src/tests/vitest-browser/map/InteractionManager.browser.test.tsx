/**
 * Browser-mode tests for `InteractionManager`.
 *
 * Mocks:
 *  - `useCoordConverters` — avoids Automerge dependency
 *  - All thunk save-position functions (HTTP side effects)
 *
 * Verifies:
 *  - No cursor change and no interactions added when mapDirective is null
 *  - createMarker: sets crosshair cursor
 *  - cancelCreateMarker: clears directive immediately
 *  - cancelEditMarker: clears directive immediately
 *  - editMarker: adds Translate interaction when feature found on map
 *  - editMarker: clears directive when feature not found
 *  - saveEditPolyline: clears directive
 *  - cancelEditPolyline traverse: dispatches revertTraversePath + clears directive
 *  - cancelEditPolyline walkback: dispatches revertWalkbackPath + clears directive
 *  - InteractionManager renders null (no DOM output)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import { flushSync } from "react-dom";

import { MapContext } from "components/interface/map/MapProvider";
import { InteractionManager } from "components/interface/map/behaviors/InteractionManager";
import { mapSlice, updateMapDirective } from "store/map";
import { traverseSlice } from "store/traverse";
import { stationSlice } from "store/station";
import { interfaceSlice } from "store/interface";
import { poiSlice } from "store/poi";
import { evaSlice } from "store/eva";
import { measureSlice } from "store/measure";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";
import { dispatchMapClick } from "./helpers/dispatchMapEvent";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

// Stub all save-position thunks — we only care that the directive is cleared,
// not that the HTTP call fires in unit tests.
vi.mock("store/thunk/thunkStation", () => ({
  thunkDocUpdateStationLocation: vi.fn(() => ({ type: "mock/thunkDocUpdateStationLocation" })),
  thunkDocUpdateWalkback: vi.fn(() => ({ type: "mock/thunkDocUpdateWalkback" })),
  thunkDocResetWalkback: vi.fn(() => ({ type: "mock/thunkDocResetWalkback" })),
}));

vi.mock("store/thunk/thunkPoi", () => ({
  thunkDocUpdatePoiLocation: vi.fn(() => ({ type: "mock/thunkDocUpdatePoiLocation" })),
}));

vi.mock("store/thunk/thunkMission", () => ({
  thunkDocUpdateLanderLocation: vi.fn(() => ({ type: "mock/thunkDocUpdateLanderLocation" })),
}));

vi.mock("store/thunk/thunkAction", () => ({
  thunkDocUpdateActionLocation: vi.fn(() => ({ type: "mock/thunkDocUpdateActionLocation" })),
}));

vi.mock("store/thunk/thunkRexPosEntry", () => ({
  thunkDocUpdatePosEntryWithLocation: vi.fn(() => ({
    type: "mock/thunkDocUpdatePosEntryWithLocation",
  })),
}));

vi.mock("store/thunk/thunkTraverse", () => ({
  // Return a plain action so it is dispatchable (and awaitable) in tests.
  thunkDocUpdateTraverse: vi.fn(() => ({ type: "mock/thunkDocUpdateTraverse" })),
  thunkDocResetTraverse: vi.fn(() => ({ type: "mock/thunkDocResetTraverse" })),
}));

vi.mock("store/thunk/thunkMeasurement", () => ({
  thunkUpdateMeasurementPath: vi.fn(() => ({ type: "mock/thunkUpdateMeasurementPath" })),
}));

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      map: mapSlice.reducer,
      traverse: traverseSlice.reducer,
      station: stationSlice.reducer,
      interface: interfaceSlice.reducer,
      poi: poiSlice.reducer,
      eva: evaSlice.reducer,
      measure: measureSlice.reducer,
    },
    preloadedState,
  });
}

// ---------------------------------------------------------------------------
// Harness state
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

function renderInteractionManager(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <MapContext.Provider value={{ map, mode }}>
        <InteractionManager />
      </MapContext.Provider>
    </Provider>
  );
}

/** Count OL interactions that are not the default built-in ones (DoubleClickZoom etc.) */
function interactionCount(): number {
  return map.getInteractions().getLength();
}

beforeEach(() => {
  vi.clearAllMocks();
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    interactions: [], // start with NO default interactions for clean counting
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });

  store = makeStore();
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InteractionManager", () => {
  it("adds no interactions when mapDirective is null", () => {
    renderInteractionManager();
    expect(interactionCount()).toBe(0);
  });

  it("sets crosshair cursor for createMarker directive", () => {
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "poi-1", mapItemType: "poi", mapAction: "createMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(mapContainer.style.cursor).toBe("crosshair");
  });

  it("cancelCreateMarker clears the directive", () => {
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "poi-1", mapItemType: "poi", mapAction: "cancelCreateMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    // After rendering, the effect dispatches updateMapDirective(null)
    expect(store.getState().map.mapDirective).toBeNull();
  });

  it("cancelEditMarker clears the directive", () => {
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "station-1", mapItemType: "station", mapAction: "cancelEditMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(store.getState().map.mapDirective).toBeNull();
  });

  it("saveEditPolyline clears the directive", () => {
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "traverse-1",
          mapItemType: "traverse",
          mapAction: "saveEditPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(store.getState().map.mapDirective).toBeNull();
  });

  it("editMarker adds a Translate interaction when feature exists on map", () => {
    // Place a feature on a VectorLayer attached to the map
    const source = new VectorSource();
    const feature = new Feature(new Point([0, 0]));
    feature.setId("station-1");
    source.addFeature(feature);
    const layer = new VectorLayer({ source });
    map.addLayer(layer);

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "station-1", mapItemType: "station", mapAction: "editMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    // Translate interaction added → count = 1
    expect(interactionCount()).toBe(1);
  });

  it("cancels an in-progress edit when the selection changes (navigating away)", () => {
    const source = new VectorSource();
    const feature = new Feature(new Point([0, 0]));
    feature.setId("station-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      station: { ...stationSlice.getInitialState(), selectedStationUuid: "station-1" },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "station" },
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "station-1", mapItemType: "station", mapAction: "editMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    // Edit is active (Translate interaction present)
    expect(interactionCount()).toBe(1);

    // User navigates to a different item (e.g. selects a POI in the left panel)
    flushSync(() => {
      store.dispatch(poiSlice.actions.setSelectedPoiUuid("poi-99"));
      store.dispatch(interfaceSlice.actions.setSectionSelected("poi"));
    });

    // The stale edit is torn down
    expect(store.getState().map.mapDirective).toBeNull();
    expect(interactionCount()).toBe(0);
  });

  it("editMarker: clicking the map moves the marker to that point and finishes", async () => {
    const { thunkDocUpdateStationLocation } = await import("store/thunk/thunkStation");

    const source = new VectorSource();
    const feature = new Feature(new Point([0, 0]));
    feature.setId("station-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "station-1", mapItemType: "station", mapAction: "editMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    // Click-to-place: click on the map at coord [20000, 10000] → {lat:10, lng:20}
    flushSync(() => {
      dispatchMapClick(map, [50, 50], [20000, 10000]);
    });

    expect(vi.mocked(thunkDocUpdateStationLocation)).toHaveBeenCalledWith({
      location: { lat: 10, lng: 20 },
      stationUuid: "station-1",
    });
    // Edit finishes after a click-to-place
    expect(store.getState().map.mapDirective).toBeNull();
  });

  it("editMarker clears directive when feature is not found on any layer", () => {
    // No feature with id "missing-uuid" on the map
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "missing-uuid", mapItemType: "station", mapAction: "editMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(store.getState().map.mapDirective).toBeNull();
    expect(interactionCount()).toBe(0);
  });

  it("editMarker for a posEntry adds a Translate on its feature (now a vector feature)", () => {
    // POS entries are vector features on posSource, so editMarker finds the
    // feature and drives it through the standard Translate path.
    const source = new VectorSource();
    const feature = new Feature(new Point([0, 0]));
    feature.setId("pos-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "pos-1", mapItemType: "posEntry", mapAction: "editMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    expect(store.getState().map.mapDirective).not.toBeNull();
    expect(interactionCount()).toBe(1);
    expect(mapContainer.style.cursor).toBe("crosshair");
  });

  it("editMarker for a posEntry: clicking the map moves it and finishes", async () => {
    const { thunkDocUpdatePosEntryWithLocation } = await import("store/thunk/thunkRexPosEntry");

    const source = new VectorSource();
    const feature = new Feature(new Point([0, 0]));
    feature.setId("pos-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "pos-1", mapItemType: "posEntry", mapAction: "editMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    // Click-to-place: click on the map at coord [20000, 10000] → {lat:10, lng:20}
    flushSync(() => {
      dispatchMapClick(map, [50, 50], [20000, 10000]);
    });

    expect(vi.mocked(thunkDocUpdatePosEntryWithLocation)).toHaveBeenCalledWith({
      location: { lat: 10, lng: 20 },
      posEntryUuid: "pos-1",
    });
    // Edit finishes after a click-to-place
    expect(store.getState().map.mapDirective).toBeNull();
  });

  it("cancelEditPolyline for traverse dispatches thunkDocResetTraverse and clears directive", async () => {
    const { thunkDocResetTraverse } = await import("store/thunk/thunkTraverse");

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "traverse-1",
          mapItemType: "traverse",
          mapAction: "cancelEditPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    // directive cleared
    expect(store.getState().map.mapDirective).toBeNull();
    // thunkDocResetTraverse dispatched
    expect(vi.mocked(thunkDocResetTraverse)).toHaveBeenCalledWith({ traverseUuid: "traverse-1" });
  });

  it("cursor is cleared on unmount", () => {
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: { uuid: "poi-1", mapItemType: "poi", mapAction: "createMarker" },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(mapContainer.style.cursor).toBe("crosshair");

    // Dispatch null directive to clean up
    flushSync(() => {
      store.dispatch(updateMapDirective(null));
    });
    expect(mapContainer.style.cursor).toBe("");
  });

  it("Translate interaction removed when directive changes from editMarker to null", () => {
    const source = new VectorSource();
    const feature = new Feature(new Point([0, 0]));
    feature.setId("station-edit");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "station-edit",
          mapItemType: "station",
          mapAction: "editMarker",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(interactionCount()).toBe(1);

    flushSync(() => {
      store.dispatch(updateMapDirective(null));
    });
    expect(interactionCount()).toBe(0);
  });

  it("editPolyline adds a Modify interaction for a traverse feature", async () => {
    const { LineString } = await import("ol/geom");
    const source = new VectorSource();
    const feature = new Feature(
      new LineString([
        [0, 0],
        [10, 10],
      ])
    );
    feature.setId("traverse-edit-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "traverse-edit-1",
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(interactionCount()).toBe(1);

    // Cursor should be crosshair while editing polyline
    expect(mapContainer.style.cursor).toBe("crosshair");

    // And the interaction is removed when the directive clears
    flushSync(() => {
      store.dispatch(updateMapDirective(null));
    });
    expect(interactionCount()).toBe(0);
    expect(mapContainer.style.cursor).toBe("");
  });

  it("editPolyline for a walkback feature uses prefixed feature id", async () => {
    const { LineString } = await import("ol/geom");
    const source = new VectorSource();
    // Walkback features have id `walkback-${stationUuid}`
    const feature = new Feature(
      new LineString([
        [0, 0],
        [10, 10],
      ])
    );
    feature.setId("walkback-station-77");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "station-77",
          mapItemType: "walkback",
          mapAction: "editPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    // Successfully resolved the prefixed id → Modify interaction added
    expect(interactionCount()).toBe(1);
  });

  it("editPolyline pins traverse endpoints — an endpoint drag is restored", async () => {
    const { LineString } = await import("ol/geom");
    const source = new VectorSource();
    const feature = new Feature(
      new LineString([
        [0, 0],
        [5, 5],
        [10, 10],
      ])
    );
    feature.setId("traverse-pin-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "traverse-pin-1",
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    const geom = feature.getGeometry() as InstanceType<typeof LineString>;

    // Simulate dragging the first (lander/station-anchored) endpoint away.
    geom.setCoordinates([
      [99, 99],
      [5, 5],
      [10, 10],
    ]);
    // The endpoint is restored to its anchor; the interior vertex is untouched.
    expect(geom.getCoordinates()).toEqual([
      [0, 0],
      [5, 5],
      [10, 10],
    ]);

    // Simulate dragging the last endpoint away → also restored.
    geom.setCoordinates([
      [0, 0],
      [5, 5],
      [88, 88],
    ]);
    expect(geom.getCoordinates()).toEqual([
      [0, 0],
      [5, 5],
      [10, 10],
    ]);
  });

  it("editPolyline allows moving a traverse's interior vertex", async () => {
    const { LineString } = await import("ol/geom");
    const source = new VectorSource();
    const feature = new Feature(
      new LineString([
        [0, 0],
        [5, 5],
        [10, 10],
      ])
    );
    feature.setId("traverse-pin-2");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "traverse-pin-2",
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    const geom = feature.getGeometry() as InstanceType<typeof LineString>;

    // Move only the interior vertex — endpoints unchanged, so nothing is reset.
    geom.setCoordinates([
      [0, 0],
      [7, 3],
      [10, 10],
    ]);
    expect(geom.getCoordinates()).toEqual([
      [0, 0],
      [7, 3],
      [10, 10],
    ]);
  });

  it.each([
    ["traverse", "traverse-final", "thunkDocUpdateTraverse"],
    ["walkback", "walkback-station-final", "thunkDocUpdateWalkback"],
    ["measurement", "measurement-final", "thunkUpdateMeasurementPath"],
  ] as const)(
    "editPolyline performs throttled %s updates and one final save",
    async (mapItemType, featureId, thunkName) => {
      const { LineString } = await import("ol/geom");
      const traverseThunks = await import("store/thunk/thunkTraverse");
      const stationThunks = await import("store/thunk/thunkStation");
      const measurementThunks = await import("store/thunk/thunkMeasurement");
      const saveThunk =
        thunkName === "thunkDocUpdateTraverse"
          ? vi.mocked(traverseThunks.thunkDocUpdateTraverse)
          : thunkName === "thunkDocUpdateWalkback"
            ? vi.mocked(stationThunks.thunkDocUpdateWalkback)
            : vi.mocked(measurementThunks.thunkUpdateMeasurementPath);
      const source = new VectorSource();
      const feature = new Feature(
        new LineString([
          [0, 0],
          [5, 5],
          [10, 10],
        ])
      );
      feature.setId(featureId);
      source.addFeature(feature);
      map.addLayer(new VectorLayer({ source }));

      store = makeStore({
        map: {
          ...mapSlice.getInitialState(),
          mapDirective: {
            uuid: mapItemType === "walkback" ? "station-final" : featureId,
            mapItemType,
            mapAction: "editPolyline",
          },
        },
      } as PartialPreloadedState);

      renderInteractionManager();
      const geom = feature.getGeometry() as InstanceType<typeof LineString>;
      geom.setCoordinates([
        [0, 0],
        [7, 3],
        [10, 10],
      ]);
      expect(saveThunk).toHaveBeenCalledOnce();

      // Queue a trailing update inside the throttle window. modifyend must
      // cancel it rather than flushing it before the final update.
      geom.setCoordinates([
        [0, 0],
        [8, 4],
        [10, 10],
      ]);

      const modify = map.getInteractions().item(0);
      modify.dispatchEvent("modifyend");
      await Promise.resolve();

      expect(saveThunk).toHaveBeenCalledTimes(2);
      expect(saveThunk).toHaveBeenLastCalledWith(
        mapItemType === "traverse"
          ? expect.objectContaining({ traverseUuid: featureId })
          : mapItemType === "walkback"
            ? expect.objectContaining({ stationUuid: "station-final" })
            : expect.objectContaining({ measurementUuid: featureId })
      );
    }
  );

  it("editPolyline does not pin measurement endpoints (free-form)", async () => {
    const { LineString } = await import("ol/geom");
    const source = new VectorSource();
    const feature = new Feature(
      new LineString([
        [0, 0],
        [10, 10],
      ])
    );
    feature.setId("measurement-1");
    source.addFeature(feature);
    map.addLayer(new VectorLayer({ source }));

    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "measurement-1",
          mapItemType: "measurement",
          mapAction: "editPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();

    const geom = feature.getGeometry() as InstanceType<typeof LineString>;

    // Measurement endpoints are free to move — no restore.
    geom.setCoordinates([
      [99, 99],
      [10, 10],
    ]);
    expect(geom.getCoordinates()).toEqual([
      [99, 99],
      [10, 10],
    ]);
  });

  it("editPolyline clears directive when no matching feature is on the map", () => {
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "missing-traverse",
          mapItemType: "traverse",
          mapAction: "editPolyline",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(store.getState().map.mapDirective).toBeNull();
    expect(interactionCount()).toBe(0);
  });

  it("createMarker click dispatches saveItemPosition and clears directive", async () => {
    const { thunkDocUpdateStationLocation } = await import("store/thunk/thunkStation");
    store = makeStore({
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "new-station-uuid",
          mapItemType: "station",
          mapAction: "createMarker",
        },
      },
    } as PartialPreloadedState);

    renderInteractionManager();
    expect(mapContainer.style.cursor).toBe("crosshair");
    expect(store.getState().map.mapDirective).not.toBeNull();

    // Simulate the user clicking the map at projected coordinate (50000, 30000)
    // → mocked toAegisPoint returns { lat: 30, lng: 50 }
    flushSync(() => {
      dispatchMapClick(map, [10, 10], [50000, 30000]);
    });

    // The save thunk fired with the projected→AEGIS coord
    const thunkMock = vi.mocked(thunkDocUpdateStationLocation);
    expect(thunkMock).toHaveBeenCalledTimes(1);
    const arg = thunkMock.mock.calls[0][0] as {
      stationUuid: string;
      location: { lat: number; lng: number };
    };
    expect(arg.stationUuid).toBe("new-station-uuid");
    expect(arg.location.lat).toBeCloseTo(30, 5);
    expect(arg.location.lng).toBeCloseTo(50, 5);

    // And the directive was cleared after the one-shot click
    expect(store.getState().map.mapDirective).toBeNull();
    // Cursor restored
    expect(mapContainer.style.cursor).toBe("");
  });
});
