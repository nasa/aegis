/**
 * Browser-mode tests for `SelectionHighlight`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map and a Redux store
 * with the minimal slices the component reads. `useCoordConverters` is mocked
 * so we avoid the full Automerge mission-doc dependency.
 *
 * Verifies:
 *  - Selection layer added at SELECTION z-index in editor mode only
 *  - Highlight circle drawn for selected station (sectionSelected=station)
 *  - Highlight circle drawn for selected POI (sectionSelected=poi)
 *  - Highlight cleared when selection is removed
 *  - Layer removed on unmount
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Point as OlPoint } from "ol/geom";

import { MapContext } from "components/interface/map/MapProvider";
import { SelectionHighlight } from "components/interface/map/behaviors/SelectionHighlight";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { stationSlice } from "store/station";
import { poiSlice } from "store/poi";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { measureSlice } from "store/measure";
import { rexSlice } from "store/rex";
import { traverseSlice } from "store/traverse";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
  createCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

// Mutable mock Automerge doc — tests populate stations/pois here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STATION_UUID = "station-uuid-sel-1";
const POI_UUID = "poi-uuid-sel-1";

const TEST_STATION: Station = {
  uuid: STATION_UUID,
  name: "Alpha",
  icon: "1f535",
  location: { lat: 10, lng: 20 },
  mapCircleControls: {},
  updatedAt: new Date().toISOString(),
} as unknown as Station;

const TEST_POI: POI = {
  uuid: POI_UUID,
  name: "Science POI",
  icon: "1f50d",
  location: { lat: 15, lng: 25 },
  updatedAt: new Date().toISOString(),
} as unknown as POI;

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

function makeStore() {
  return configureStore({
    reducer: {
      station: stationSlice.reducer,
      poi: poiSlice.reducer,
      eva: evaSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      measure: measureSlice.reducer,
      rex: rexSlice.reducer,
      traverse: traverseSlice.reducer,
    },
  });
}

type TestStore = ReturnType<typeof makeStore>;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: TestStore;

function findSelectionLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.SELECTION) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderSelectionHighlight(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <MapContext.Provider value={{ map, mode }}>
        <SelectionHighlight />
      </MapContext.Provider>
    </Provider>
  );
}

beforeEach(() => {
  store = makeStore();
  harness = createReactHarness();

  // Reset mock doc before each test
  Object.keys(mockMissionDoc).forEach((k) => {
    delete (mockMissionDoc as Record<string, unknown>)[k];
  });

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });
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

describe("SelectionHighlight", () => {
  it("adds a selection vector layer at SELECTION z-index in editor mode", () => {
    renderSelectionHighlight("editor");
    const layer = findSelectionLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.SELECTION);
  });

  it.each(["dashboard", "minimap"] as const)(
    "does NOT add a selection layer in %s mode",
    (mode) => {
      renderSelectionHighlight(mode);
      expect(findSelectionLayer()).toBeNull();
    }
  );

  it("draws a highlight circle when a station is selected", () => {
    // Pre-load station into mock doc and selection UUID into Redux
    mockMissionDoc.stations = { [STATION_UUID]: TEST_STATION } as unknown as Mission["stations"];
    store = makeStore();
    store.dispatch(stationSlice.actions.setSelectedStationUuid(STATION_UUID));
    store.dispatch(interfaceSlice.actions.setSectionSelected("station"));

    renderSelectionHighlight("editor");

    const layer = findSelectionLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe("selection-highlight");

    const geom = features[0].getGeometry() as OlPoint;
    // toMapCoord([10, 20]) → [20*1000, 10*1000] = [20000, 10000]
    expect(geom.getCoordinates()).toEqual([20000, 10000]);
  });

  it("draws a highlight circle when a POI is selected", () => {
    mockMissionDoc.pois = { [POI_UUID]: TEST_POI } as unknown as Mission["pois"];
    store = makeStore();
    store.dispatch(poiSlice.actions.setSelectedPoiUuid(POI_UUID));
    store.dispatch(interfaceSlice.actions.setSectionSelected("poi"));

    renderSelectionHighlight("editor");

    const layer = findSelectionLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe("selection-highlight");

    const geom = features[0].getGeometry() as OlPoint;
    expect(geom.getCoordinates()).toEqual([25000, 15000]);
  });

  it("starts with no highlight feature when nothing is selected", () => {
    renderSelectionHighlight("editor");
    const layer = findSelectionLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("clears the highlight when the station is deselected", () => {
    mockMissionDoc.stations = { [STATION_UUID]: TEST_STATION } as unknown as Mission["stations"];
    store = makeStore();
    store.dispatch(stationSlice.actions.setSelectedStationUuid(STATION_UUID));
    store.dispatch(interfaceSlice.actions.setSectionSelected("station"));

    renderSelectionHighlight("editor");

    const layer = findSelectionLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(1);

    flushSync(() => {
      store.dispatch(interfaceSlice.actions.setSectionSelected("preset"));
    });

    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("removes the selection layer from the map on unmount", () => {
    renderSelectionHighlight("editor");
    expect(findSelectionLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findSelectionLayer()).toBeNull();
  });
});
