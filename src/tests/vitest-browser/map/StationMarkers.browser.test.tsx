/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `StationMarkers`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map, a minimal Redux
 * store, real FeatureSourcesProvider and MapMenuProvider contexts.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * Verifies:
 *  - Station VectorLayer added at STATIONS z-index
 *  - Features placed on the shared stationSource with correct IDs
 *  - EVA-sequence stations always shown even when display is off
 *  - As-planned stations hidden when mapDisplayStations.show=false
 *  - Folder visibility filtering for as-planned stations
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

import { CookiesProvider, Cookies } from "react-cookie";
import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { StationMarkers } from "components/interface/map/behaviors/StationMarkers";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { stationSlice } from "store/station";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { rexSlice } from "store/rex";
import { poiSlice } from "store/poi";
import { traverseSlice } from "store/traverse";
import { measureSlice } from "store/measure";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";
import { dispatchMapClick } from "./helpers/dispatchMapEvent";

// Mutable doc state — mutate directly before rendering to provide entity data.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

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

// Mock the click thunk so we can assert the dispatched payload without exercising
// downstream selectors (rex, eva sequence lookups, panel-open thunks, etc.).
const thunkMarkerOnClickMock = vi.fn((_args: unknown) => ({
  type: "mock/thunkMarkerOnClick",
}));
vi.mock("store/thunk/thunkMap", () => ({
  thunkMarkerOnClick: (args: unknown) => thunkMarkerOnClickMock(args),
}));

// Mock the position-update thunk for drag tests.
const thunkDocUpdateStationLocationMock = vi.fn((_args: unknown) => ({
  type: "mock/thunkDocUpdateStationLocation",
}));
vi.mock("store/thunk/thunkStation", () => ({
  thunkDocUpdateStationLocation: (args: unknown) => thunkDocUpdateStationLocationMock(args),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STATION_A_UUID = "station-a-uuid";
const STATION_B_UUID = "station-b-uuid";
const EVA_UUID = "eva-uuid-1";
const FOLDER_UUID = "station-folder-1";

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

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      station: stationSlice.reducer,
      eva: evaSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      rex: rexSlice.reducer,
      poi: poiSlice.reducer,
      traverse: traverseSlice.reducer,
      measure: measureSlice.reducer,
    },
    preloadedState,
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

/** Captured stationSource from FeatureSourcesProvider */
let stationSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceAndSetterCapture(): null {
  stationSource = useFeatureSourcesContext().stationSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findStationLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.STATIONS) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderStationMarkers(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode }}>
              <StationMarkers />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  // Reset mutable doc state
  for (const key of Object.keys(mockMissionDoc)) {
    delete (mockMissionDoc as Record<string, unknown>)[key];
  }
  stationSource = null;
  capturedSetters = null;
  harness = createReactHarness();
  testCookies = new Cookies();

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

describe("StationMarkers", () => {
  it("adds a station VectorLayer at STATIONS z-index", () => {
    store = makeStore();
    renderStationMarkers();
    const layer = findStationLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.STATIONS);
  });

  it("adds a station layer in dashboard mode too", () => {
    store = makeStore();
    renderStationMarkers("dashboard");
    expect(findStationLayer()).not.toBeNull();
  });

  it("places EVA-sequence station features on the shared stationSource", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
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

    renderStationMarkers();

    expect(stationSource).not.toBeNull();
    const features = stationSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(STATION_A_UUID);
  });

  it("shows multiple EVA-sequence station features", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const stationB = makeStation(STATION_B_UUID, 15, 25);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID, STATION_B_UUID]);
    mockMissionDoc.stations = {
      [STATION_A_UUID]: stationA,
      [STATION_B_UUID]: stationB,
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

    renderStationMarkers();

    expect(stationSource!.getFeatures()).toHaveLength(2);
  });

  it("shows as-planned stations when display is on (default) and no EVA selected", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      rex: {
        ...rexSlice.getInitialState(),
        rexesFromDb: [],
      },
    } as PartialPreloadedState);

    renderStationMarkers();

    // mapDisplayStations.show=true (default) + stationA not in any REX EVA
    // → selectAsPlannedStations returns stationA → it appears on the map
    const features = stationSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(STATION_A_UUID);
  });

  it("station feature properties include mapItemType, emoji, and name", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
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

    renderStationMarkers();

    const feature = stationSource!.getFeatureById(STATION_A_UUID)!;
    expect(feature).not.toBeNull();
    expect(feature.get("mapItemType")).toBe("station");
    expect(feature.get("emoji")).toBe("1f535");
    expect(feature.get("name")).toBe(`Station ${STATION_A_UUID.slice(-1)}`);
  });

  it("removes stale features when a station is removed from the EVA sequence", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const stationB = makeStation(STATION_B_UUID, 15, 25);
    const evaWithBoth = makeEva(EVA_UUID, [STATION_A_UUID, STATION_B_UUID]);
    const evaWithOneOnly = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = {
      [STATION_A_UUID]: stationA,
      [STATION_B_UUID]: stationB,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: evaWithBoth } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
      rex: { ...rexSlice.getInitialState() },
    } as PartialPreloadedState);

    renderStationMarkers();

    // Turn off as-planned display so only EVA-sequence stations appear
    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: false,
        showLabels: false,
        showWalkbacks: false,
        showCircles: false,
      });
    });
    expect(stationSource!.getFeatures()).toHaveLength(2);

    // Update the EVA sequence in the doc mock to only include STATION_A
    // then re-render to trigger the useMissionDocSelector re-evaluation.
    mockMissionDoc.evas = {
      [EVA_UUID]: evaWithOneOnly as unknown as Eva,
    };
    // Re-render in place (reconcile) so useMissionDocSelector re-reads the mutated doc.
    // React preserves MapMenuProvider state across reconcile calls on the same root.
    renderStationMarkers();

    expect(stationSource!.getFeatures()).toHaveLength(1);
    expect(stationSource!.getFeatureById(STATION_A_UUID)).not.toBeNull();
    expect(stationSource!.getFeatureById(STATION_B_UUID)).toBeNull();
  });

  it("skips stations with missing location", () => {
    const badStation = {
      ...makeStation(STATION_A_UUID, 0, 0),
      location: null,
    } as unknown as Station;
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: badStation } as unknown as Mission["stations"];
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

    renderStationMarkers();
    expect(stationSource!.getFeatures()).toHaveLength(0);
  });

  it("hides as-planned station in a hidden folder", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20); // no folder → shown
    const stationB = makeStation(STATION_B_UUID, 15, 25); // hidden folder → hidden
    mockMissionDoc.stations = {
      [STATION_A_UUID]: stationA,
      [STATION_B_UUID]: stationB,
    } as unknown as Mission["stations"];

    store = makeStore({
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
        folders: [
          {
            uuid: FOLDER_UUID,
            type: "station",
            items: [STATION_B_UUID],
            name: "Hidden Folder",
          },
        ],
        foldersInterface: [{ uuid: FOLDER_UUID, visible: false }],
      },
      rex: { ...rexSlice.getInitialState() },
    } as PartialPreloadedState);

    renderStationMarkers();

    const features = stationSource!.getFeatures();
    // stationA (no folder) should appear; stationB (hidden folder) should not
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(STATION_A_UUID);
  });

  it("shows as-planned station in a visible folder", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
        folders: [
          {
            uuid: FOLDER_UUID,
            type: "station",
            items: [STATION_A_UUID],
            name: "Visible Folder",
          },
        ],
        foldersInterface: [{ uuid: FOLDER_UUID, visible: true }],
      },
      rex: { ...rexSlice.getInitialState() },
    } as PartialPreloadedState);

    renderStationMarkers();

    expect(stationSource!.getFeatures()).toHaveLength(1);
    expect(stationSource!.getFeatureById(STATION_A_UUID)).not.toBeNull();
  });

  it("removes its station layer from the map on unmount", () => {
    store = makeStore();
    renderStationMarkers();
    expect(findStationLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findStationLayer()).toBeNull();
  });

  it("clears features from source when display toggled off with no EVA active", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      rex: { ...rexSlice.getInitialState() },
    } as PartialPreloadedState);

    renderStationMarkers();
    // With display on (default) and no REX filtering, stationA appears as-planned
    expect(stationSource!.getFeatures()).toHaveLength(1);

    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: false,
        showLabels: false,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    // No EVA selected + display off → nothing to show
    expect(stationSource!.getFeatures()).toHaveLength(0);
  });

  describe("click handler (editor mode)", () => {
    beforeEach(() => {
      thunkMarkerOnClickMock.mockClear();
    });

    it("dispatches thunkMarkerOnClick with station uuid when click hits a station", () => {
      const stationA = makeStation(STATION_A_UUID, 10, 20);
      const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
      mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
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

      renderStationMarkers();
      const layer = findStationLayer()!;
      const feature = stationSource!.getFeatureById(STATION_A_UUID)!;
      expect(feature).not.toBeNull();

      // Stub hit-testing to return our station feature only when scanning
      // the StationMarkers layer.
      vi.spyOn(map, "forEachFeatureAtPixel").mockImplementation(
        (_pixel, callback, opts: unknown) => {
          const layerFilter = (opts as { layerFilter?: (l: unknown) => boolean })?.layerFilter;
          if (!layerFilter || layerFilter(layer)) {
            return (callback as (f: unknown) => unknown)(feature);
          }
          return undefined;
        }
      );

      // Dispatch a click — the registered handler reads only `evt.pixel`.
      dispatchMapClick(map, [50, 50], [20000, 10000]);

      expect(thunkMarkerOnClickMock).toHaveBeenCalledTimes(1);
      expect(thunkMarkerOnClickMock).toHaveBeenCalledWith({
        markerUuid: STATION_A_UUID,
        mapItemType: "station",
      });
    });

    it("does NOT dispatch when click misses all station features", () => {
      const stationA = makeStation(STATION_A_UUID, 10, 20);
      const eva = makeEva(EVA_UUID, [STATION_A_UUID]);

      mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
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

      renderStationMarkers();

      // Hit-test returns nothing → click handler should bail
      vi.spyOn(map, "forEachFeatureAtPixel").mockReturnValue(undefined);

      dispatchMapClick(map, [9999, 9999], [99999, 99999]);

      expect(thunkMarkerOnClickMock).not.toHaveBeenCalled();
    });

    it("does NOT register a click handler in minimap mode (stationClickable=false)", () => {
      store = makeStore();
      const onSpy = vi.spyOn(map, "on");
      renderStationMarkers("minimap");

      // No 'click' listener should have been registered for the layer
      const clickRegistrations = onSpy.mock.calls.filter(
        (c) => (c[0] as unknown as string) === "click"
      );
      expect(clickRegistrations).toHaveLength(0);
    });
  });

  describe("drag interaction", () => {
    beforeEach(() => {
      thunkDocUpdateStationLocationMock.mockClear();
    });

    it("adds a Translate interaction in editor mode", () => {
      store = makeStore();
      const before = map.getInteractions().getLength();
      renderStationMarkers();
      const after = map.getInteractions().getLength();
      expect(after).toBe(before + 1);
    });

    it("does NOT add a Translate interaction in dashboard mode (stationDraggable=false)", () => {
      store = makeStore();
      const before = map.getInteractions().getLength();
      renderStationMarkers("dashboard");
      const after = map.getInteractions().getLength();
      expect(after).toBe(before);
    });

    it("translateend dispatches thunkUpdateStationLocation with new coordinates", async () => {
      const { Collection } = await import("ol");
      const { default: Feature } = await import("ol/Feature");
      const { default: Point } = await import("ol/geom/Point");
      const stationA = makeStation(STATION_A_UUID, 10, 20);
      mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

      store = makeStore({
        station: {
          ...stationSlice.getInitialState(),
          selectedStationUuid: STATION_A_UUID,
        },
      } as PartialPreloadedState);

      renderStationMarkers();

      // Find the Translate interaction (the last one we added)
      const interactions = map.getInteractions().getArray();
      const translate = interactions[interactions.length - 1] as {
        dispatchEvent: (e: unknown) => void;
      };

      // Build a feature with a known final coordinate at projected (40000, 30000),
      // which our mocked toAegisPoint converts back to { lat: 30, lng: 40 }.
      const movedFeature = new Feature(new Point([40000, 30000]));
      movedFeature.setId(STATION_A_UUID);

      translate.dispatchEvent({
        type: "translateend",
        features: new Collection([movedFeature]),
      });

      expect(thunkDocUpdateStationLocationMock).toHaveBeenCalledTimes(1);
      const payload = thunkDocUpdateStationLocationMock.mock.calls[0]?.[0] as {
        location: { lat: number; lng: number };
        stationUuid: string;
      };
      expect(payload.stationUuid).toBe(STATION_A_UUID);
      expect(payload.location.lat).toBeCloseTo(30, 5);
      expect(payload.location.lng).toBeCloseTo(40, 5);
    });
  });
});
