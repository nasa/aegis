/* eslint-disable react-hooks/globals */
/**
 * Browser-mode integration tests for EVA workflow behaviors.
 *
 * Composes StationMarkers + TraverseLines + WalkbackLines to verify the
 * end-to-end EVA editing experience — selecting an EVA shows its stations
 * and traverses, selecting a station shows walkback, switching EVAs
 * rebuilds features, etc.
 *
 * Mocks: useCoordConverters, thunks (marker click, polyline click,
 *        station location update)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { CookiesProvider, Cookies } from "react-cookie";
import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { StationMarkers } from "components/interface/map/behaviors/StationMarkers";
import { TraverseLines } from "components/interface/map/behaviors/TraverseLines";
import { WalkbackLines } from "components/interface/map/behaviors/WalkbackLines";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { stationSlice } from "store/station";
import { evaSlice } from "store/eva";
import { hoverSlice } from "store/hover";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { rexSlice } from "store/rex";
import { poiSlice } from "store/poi";
import { traverseSlice } from "store/traverse";
import { measureSlice } from "store/measure";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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

// Mutable mock Automerge doc — tests populate stations/evas/traverses here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

vi.mock("store/thunk/thunkMap", () => ({
  thunkMarkerOnClick: () => ({ type: "mock/thunkMarkerOnClick" }),
  thunkPolylineOnClick: () => ({ type: "mock/thunkPolylineOnClick" }),
}));

vi.mock("store/thunk/thunkStation", () => ({
  thunkDocUpdateStationLocation: () => ({ type: "mock/thunkDocUpdateStationLocation" }),
  thunkDocUpdateWalkback: vi.fn(() => ({ type: "mock/thunkDocUpdateWalkback" })),
  thunkDocResetWalkback: vi.fn(() => ({ type: "mock/thunkDocResetWalkback" })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATION_A = "station-a-uuid";
const STATION_B = "station-b-uuid";
const STATION_C = "station-c-uuid";
const EVA_UUID = "eva-uuid-1";
const EVA_UUID_2 = "eva-uuid-2";
const TRAVERSE_UUID = "traverse-uuid-1";

function makeStation(uuid: string, lat: number, lng: number, walkbackPath?: AEGISPoint[]): Station {
  return {
    uuid,
    name: `Station ${uuid.slice(-1)}`,
    icon: "1f535",
    location: { lat, lng },
    mapCircleControls: {},
    updatedAt: new Date().toISOString(),
    refUuid: null,
    walkbackPath: walkbackPath ?? null,
  } as unknown as Station;
}

/** Build a simple EVA with station-only sequence (no traverses). */
function makeEva(uuid: string, stationUuids: string[]): Eva {
  return {
    uuid,
    name: `EVA ${uuid.slice(-1)}`,
    traverseColor: "#ff0000",
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
    sequence: stationUuids.map((u) => ({ uuid: u, type: "station" })),
    updatedAt: new Date().toISOString(),
  } as unknown as Eva;
}

/** Build an EVA with interleaved station + traverse sequence items. */
function makeEvaWithTraverses(
  uuid: string,
  items: Array<{ uuid: string; type: "station" | "traverse" }>
): Eva {
  return {
    uuid,
    name: `EVA ${uuid.slice(-1)}`,
    traverseColor: "#ff0000",
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
    sequence: items,
    updatedAt: new Date().toISOString(),
  } as unknown as Eva;
}

function makeTraverse(uuid: string, path: AEGISPoint[], color?: string): Traverse {
  return {
    uuid,
    path,
    color: color || null,
    updatedAt: new Date().toISOString(),
  } as unknown as Traverse;
}

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(overrides: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      station: stationSlice.reducer,
      eva: evaSlice.reducer,
      hover: hoverSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      rex: rexSlice.reducer,
      poi: poiSlice.reducer,
      traverse: traverseSlice.reducer,
      measure: measureSlice.reducer,
    },
    preloadedState: overrides,
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;
let testCookies: Cookies;
let stationSource: VectorSource | null = null;
let traverseSource: VectorSource | null = null;
let walkbackSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceCapture(): null {
  const sources = useFeatureSourcesContext();
  stationSource = sources.stationSource;
  traverseSource = sources.traverseSource;
  walkbackSource = sources.walkbackSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findLayerAtZIndex(zIndex: number): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === zIndex) as VectorLayer<VectorSource> | undefined) ?? null
  );
}

function renderComposed(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceCapture />
            <MapContext.Provider value={{ map, mode }}>
              <StationMarkers />
              <TraverseLines />
              <WalkbackLines />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  stationSource = null;
  traverseSource = null;
  walkbackSource = null;
  capturedSetters = null;
  harness = createReactHarness();
  testCookies = new Cookies();

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

describe("EVA Workflow Integration", () => {
  it("selecting an EVA shows both station markers and traverse lines", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const stationB = makeStation(STATION_B, 15, 25);
    const eva = makeEvaWithTraverses(EVA_UUID, [
      { uuid: STATION_A, type: "station" },
      { uuid: TRAVERSE_UUID, type: "traverse" },
      { uuid: STATION_B, type: "station" },
    ]);
    const traverse = makeTraverse(TRAVERSE_UUID, [
      { lat: 10, lng: 20 },
      { lat: 15, lng: 25 },
    ]);
    mockMissionDoc.stations = {
      [STATION_A]: stationA,
      [STATION_B]: stationB,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
    } as PartialPreloadedState);

    renderComposed();

    // Station features (EVA sequence stations + as-planned if show=true)
    expect(stationSource!.getFeatures().length).toBeGreaterThanOrEqual(2);

    // 1 traverse feature
    expect(traverseSource!.getFeatures()).toHaveLength(1);
  });

  it("selecting a station shows its walkback line", () => {
    const stationA = makeStation(STATION_A, 10, 20, [
      { lat: 10, lng: 20 },
      { lat: 5, lng: 10 },
      { lat: 0, lng: 0 },
    ]);
    const eva = makeEva(EVA_UUID, [STATION_A]);
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A,
      },
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderComposed();

    // Walkback line should be drawn (station has walkbackPath with 3 points)
    expect(walkbackSource!.getFeatures()).toHaveLength(1);
  });

  it("walkback line disappears when station is deselected", () => {
    const stationA = makeStation(STATION_A, 10, 20, [
      { lat: 10, lng: 20 },
      { lat: 0, lng: 0 },
    ]);
    const eva = makeEva(EVA_UUID, [STATION_A]);
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A,
      },
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderComposed();
    expect(walkbackSource!.getFeatures()).toHaveLength(1);

    // Deselect station
    flushSync(() => {
      store.dispatch(stationSlice.actions.setSelectedStationUuid(null));
      store.dispatch(interfaceSlice.actions.setSectionSelected("evas"));
    });

    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });

  it("switching EVAs rebuilds station features for the new EVA sequence", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const stationB = makeStation(STATION_B, 15, 25);
    const stationC = makeStation(STATION_C, 20, 30);
    const eva1 = makeEva(EVA_UUID, [STATION_A, STATION_B]);
    const eva2 = makeEva(EVA_UUID_2, [STATION_C]);
    mockMissionDoc.stations = {
      [STATION_A]: stationA,
      [STATION_B]: stationB,
      [STATION_C]: stationC,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = {
      [EVA_UUID]: eva1,
      [EVA_UUID_2]: eva2,
    } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
    } as PartialPreloadedState);

    renderComposed();

    // Turn off as-planned display so only EVA-sequence stations appear
    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: false,
        showLabels: false,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    // EVA 1: stations A and B
    expect(stationSource!.getFeatures()).toHaveLength(2);
    expect(stationSource!.getFeatureById(STATION_A)).not.toBeNull();
    expect(stationSource!.getFeatureById(STATION_B)).not.toBeNull();

    // Switch to EVA 2
    flushSync(() => {
      store.dispatch(evaSlice.actions.setSelectedEvaUuid(EVA_UUID_2));
    });

    // Now should show only station C
    const features = stationSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(STATION_C);
  });

  it("toggling walkback display hides the walkback line", () => {
    const stationA = makeStation(STATION_A, 10, 20, [
      { lat: 10, lng: 20 },
      { lat: 0, lng: 0 },
    ]);
    const eva = makeEva(EVA_UUID, [STATION_A]);
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A,
      },
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderComposed();
    expect(walkbackSource!.getFeatures()).toHaveLength(1);

    // Toggle walkbacks off
    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: true,
        showLabels: false,
        showWalkbacks: false,
        showCircles: true,
      });
    });

    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });

  it("all layers are cleaned up on unmount", () => {
    store = makeStore();
    renderComposed();

    expect(findLayerAtZIndex(Z_INDEX.STATIONS)).not.toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.POLYLINES)).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findLayerAtZIndex(Z_INDEX.STATIONS)).toBeNull();
    // TraverseLines and WalkbackLines share the same z-index but add separate layers
    // After unmount, both should be gone
    const polylineLayers = map
      .getLayers()
      .getArray()
      .filter((l) => l.getZIndex() === Z_INDEX.POLYLINES);
    expect(polylineLayers).toHaveLength(0);
  });

  it("traverse features have the correct color property", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const stationB = makeStation(STATION_B, 15, 25);
    const eva = makeEvaWithTraverses(EVA_UUID, [
      { uuid: STATION_A, type: "station" },
      { uuid: TRAVERSE_UUID, type: "traverse" },
      { uuid: STATION_B, type: "station" },
    ]);
    const traverse = makeTraverse(
      TRAVERSE_UUID,
      [
        { lat: 10, lng: 20 },
        { lat: 15, lng: 25 },
      ],
      "#00ff00"
    );
    mockMissionDoc.stations = {
      [STATION_A]: stationA,
      [STATION_B]: stationB,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
    } as PartialPreloadedState);

    renderComposed();

    const features = traverseSource!.getFeatures();
    expect(features.length).toBeGreaterThan(0);
    // Should use the traverse-level color, not the EVA fallback
    expect(features[0].get("color")).toBe("#00ff00");
  });

  it("station without walkbackPath shows no walkback line even when selected", () => {
    const stationA = makeStation(STATION_A, 10, 20); // no walkbackPath
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderComposed();

    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });
});
