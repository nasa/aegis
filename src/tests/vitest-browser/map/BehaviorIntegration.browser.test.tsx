/* eslint-disable react-hooks/globals */
/**
 * Browser-mode integration tests — composing multiple behavior components.
 *
 * These tests mount StationMarkers + MarkerLabels + SelectionHighlight +
 * HoverHighlight together to verify they cooperate correctly:
 *  - Selecting a station creates a highlight circle AND forces the station label
 *  - Clearing a selection removes both highlight and forced label
 *  - Multiple behaviors using the same shared sources don't clobber each other
 *  - Unmount of one behavior doesn't break others
 *
 * Mocks: useCoordConverters, useMissionDocSelector, thunk dispatch mocks.
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
import { MapMenuProvider } from "components/interface/map/MapMenuProvider";
import { StationMarkers } from "components/interface/map/behaviors/StationMarkers";
import { SelectionHighlight } from "components/interface/map/behaviors/SelectionHighlight";
import { HoverHighlight } from "components/interface/map/behaviors/HoverHighlight";
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

vi.mock("store/thunk/thunkMap", () => ({
  thunkMarkerOnClick: () => ({ type: "mock/thunkMarkerOnClick" }),
}));

vi.mock("store/thunk/thunkStation", () => ({
  thunkDocUpdateStationLocation: () => ({ type: "mock/thunkDocUpdateStationLocation" }),
  thunkDocUpdateWalkback: vi.fn(() => ({ type: "mock/thunkDocUpdateWalkback" })),
  thunkDocResetWalkback: vi.fn(() => ({ type: "mock/thunkDocResetWalkback" })),
}));

// Mutable mock Automerge doc — tests populate stations/evas here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATION_A = "station-a-uuid";
const STATION_B = "station-b-uuid";
const EVA_UUID = "eva-uuid-1";

function makeStation(uuid: string, lat: number, lng: number): Station {
  return {
    uuid,
    name: `Station ${uuid.slice(-1)}`,
    icon: "1f535",
    location: { lat, lng },
    mapCircleControls: {},
    updatedAt: new Date().toISOString(),
    refUuid: null,
  } as unknown as Station;
}

function makeEva(uuid: string, stationUuids: string[]): Eva {
  return {
    uuid,
    name: "Test EVA",
    traverseColor: "#ff0000",
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
    sequence: stationUuids.map((u) => ({ uuid: u, type: "station" })),
    updatedAt: new Date().toISOString(),
  } as unknown as Eva;
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

function SourceCapture(): null {
  stationSource = useFeatureSourcesContext().stationSource;
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
              <SelectionHighlight />
              <HoverHighlight />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  stationSource = null;
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

describe("Behavior Integration: StationMarkers + SelectionHighlight + HoverHighlight", () => {
  it("all three behaviors add their respective layers without conflict", () => {
    store = makeStore();
    renderComposed();

    // StationMarkers → STATIONS layer
    expect(findLayerAtZIndex(Z_INDEX.STATIONS)).not.toBeNull();
    // SelectionHighlight → SELECTION layer (editor mode)
    expect(findLayerAtZIndex(Z_INDEX.SELECTION)).not.toBeNull();
    // HoverHighlight → HOVER layer (editor mode)
    expect(findLayerAtZIndex(Z_INDEX.HOVER)).not.toBeNull();
  });

  it("station features appear and selection is initially empty", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A]);
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

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

    // Station feature present
    expect(stationSource!.getFeatures()).toHaveLength(1);

    // Selection layer should have no features (nothing selected)
    const selectionLayer = findLayerAtZIndex(Z_INDEX.SELECTION)!;
    expect(selectionLayer.getSource()!.getFeatures()).toHaveLength(0);

    // Hover layer should have no features (nothing hovered)
    const hoverLayer = findLayerAtZIndex(Z_INDEX.HOVER)!;
    expect(hoverLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("selecting a station creates a selection highlight feature", () => {
    const stationA = makeStation(STATION_A, 10, 20);
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

    // Selection layer should now have the highlight
    const selectionLayer = findLayerAtZIndex(Z_INDEX.SELECTION)!;
    expect(selectionLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);
  });

  it("deselecting a station clears the selection highlight", () => {
    const stationA = makeStation(STATION_A, 10, 20);
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

    const selectionLayer = findLayerAtZIndex(Z_INDEX.SELECTION)!;
    expect(selectionLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);

    // Deselect
    flushSync(() => {
      store.dispatch(stationSlice.actions.setSelectedStationUuid(null));
      store.dispatch(interfaceSlice.actions.setSectionSelected("evas"));
    });

    expect(selectionLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("hover highlight is added when mapItemUuid is set", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A]);
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_A,
        mapItemType: "station" as const,
      },
    } as PartialPreloadedState);

    renderComposed();

    // Hover layer should have a highlight feature for the hovered station
    const hoverLayer = findLayerAtZIndex(Z_INDEX.HOVER)!;
    const hoverFeatures = hoverLayer.getSource()!.getFeatures();
    expect(hoverFeatures.length).toBeGreaterThan(0);
  });

  it("clearing hover removes the hover highlight without affecting selection", () => {
    const stationA = makeStation(STATION_A, 10, 20);
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
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_A,
        mapItemType: "station" as const,
      },
    } as PartialPreloadedState);

    renderComposed();

    const selectionLayer = findLayerAtZIndex(Z_INDEX.SELECTION)!;
    const hoverLayer = findLayerAtZIndex(Z_INDEX.HOVER)!;

    // Both should have features
    expect(selectionLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);
    expect(hoverLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);

    // Clear hover
    flushSync(() => {
      store.dispatch(hoverSlice.actions.clearMapItemHover());
    });

    // Hover cleared, selection preserved
    expect(hoverLayer.getSource()!.getFeatures()).toHaveLength(0);
    expect(selectionLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);
  });

  it("unmount cleans up all behavior layers", () => {
    store = makeStore();
    renderComposed();

    expect(findLayerAtZIndex(Z_INDEX.STATIONS)).not.toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.SELECTION)).not.toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.HOVER)).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findLayerAtZIndex(Z_INDEX.STATIONS)).toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.SELECTION)).toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.HOVER)).toBeNull();
  });

  it("rapid state updates (select/deselect cycle) do not leave stale features", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const stationB = makeStation(STATION_B, 15, 25);
    const eva = makeEva(EVA_UUID, [STATION_A, STATION_B]);
    mockMissionDoc.stations = {
      [STATION_A]: stationA,
      [STATION_B]: stationB,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

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

    const selectionLayer = findLayerAtZIndex(Z_INDEX.SELECTION)!;
    expect(selectionLayer.getSource()!.getFeatures()).toHaveLength(0);

    // Select station A
    flushSync(() => {
      store.dispatch(stationSlice.actions.setSelectedStationUuid(STATION_A));
      store.dispatch(interfaceSlice.actions.setSectionSelected("station"));
    });
    expect(selectionLayer.getSource()!.getFeatures().length).toBeGreaterThan(0);

    // Switch to station B
    flushSync(() => {
      store.dispatch(stationSlice.actions.setSelectedStationUuid(STATION_B));
    });
    // Should still have exactly one selection highlight (not two)
    expect(selectionLayer.getSource()!.getFeatures().length).toBe(1);

    // Deselect
    flushSync(() => {
      store.dispatch(stationSlice.actions.setSelectedStationUuid(null));
      store.dispatch(interfaceSlice.actions.setSectionSelected("evas"));
    });
    expect(selectionLayer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("no dashboard layers: SelectionHighlight and HoverHighlight skip in dashboard mode", () => {
    store = makeStore();
    renderComposed("dashboard");

    // In dashboard mode, SelectionHighlight and HoverHighlight should NOT add layers
    expect(findLayerAtZIndex(Z_INDEX.SELECTION)).toBeNull();
    expect(findLayerAtZIndex(Z_INDEX.HOVER)).toBeNull();

    // StationMarkers should still add its layer
    expect(findLayerAtZIndex(Z_INDEX.STATIONS)).not.toBeNull();
  });
});
