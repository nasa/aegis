/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `WalkbackLines`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map, a Redux store
 * with the minimal slices the component reads, and real
 * FeatureSourcesProvider / MapMenuProvider contexts.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * Verifies:
 *  - Walkback VectorLayer added at POLYLINES z-index
 *  - No features when no station is selected
 *  - Walkback line drawn for selected station with walkbackPath when section is "station"
 *  - Walkback line drawn when section is "evas" too
 *  - No line when sectionSelected is unrelated
 *  - No line when mapDisplayStations.showWalkbacks is false
 *  - Skips walkback paths shorter than 2 points
 *  - Layer removed on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { Cookies, CookiesProvider } from "react-cookie";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { LineString } from "ol/geom";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { WalkbackLines } from "components/interface/map/behaviors/WalkbackLines";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { stationSlice } from "store/station";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { hoverSlice } from "store/hover";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";
import { dispatchMapClick } from "./helpers/dispatchMapEvent";

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

// Mutable mock Automerge doc — tests populate stations here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const STATION_UUID = "station-uuid-wb-1";

function makeStation(uuid: string, walkbackPath: AEGISPoint[] | undefined): Station {
  return {
    uuid,
    name: "Station with walkback",
    icon: "1f535",
    location: { lat: 10, lng: 20 },
    walkbackPath,
    mapCircleControls: {},
    updatedAt: new Date().toISOString(),
  } as unknown as Station;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      station: stationSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      hover: hoverSlice.reducer,
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

let walkbackSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceAndSetterCapture(): null {
  walkbackSource = useFeatureSourcesContext().walkbackSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findWalkbackLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.POLYLINES) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderWalkbackLines(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode }}>
              <WalkbackLines />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
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

describe("WalkbackLines", () => {
  it("adds a walkback VectorLayer at POLYLINES z-index", () => {
    store = makeStore();
    renderWalkbackLines();
    const layer = findWalkbackLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.POLYLINES);
  });

  it("renders no walkback feature when no station is selected", () => {
    store = makeStore({
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();
    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });

  it("draws a walkback line for the selected station when section is 'station'", () => {
    const station = makeStation(STATION_UUID, [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 21 },
      { lat: 12, lng: 22 },
    ]);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();

    const features = walkbackSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(`walkback-${STATION_UUID}`);
    expect(features[0].get("mapItemType")).toBe("walkback");
    expect(features[0].get("stationUuid")).toBe(STATION_UUID);

    const geom = features[0].getGeometry() as LineString;
    expect(geom.getType()).toBe("LineString");
    expect(geom.getCoordinates()).toEqual([
      [20000, 10000],
      [21000, 11000],
      [22000, 12000],
    ]);
  });

  it("also draws walkback when section is 'evas'", () => {
    const station = makeStation(STATION_UUID, [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 21 },
    ]);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();
    expect(walkbackSource!.getFeatures()).toHaveLength(1);
  });

  it("renders no walkback when sectionSelected is something unrelated (e.g. preset)", () => {
    const station = makeStation(STATION_UUID, [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 21 },
    ]);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "preset",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();
    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });

  it("clears walkback when showWalkbacks display setting is toggled off", () => {
    const station = makeStation(STATION_UUID, [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 21 },
    ]);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();
    expect(walkbackSource!.getFeatures()).toHaveLength(1);

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

  it("skips walkback paths with fewer than 2 points", () => {
    const station = makeStation(STATION_UUID, [{ lat: 10, lng: 20 }]); // only 1 point
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();
    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });

  it("renders no walkback when station has no walkbackPath", () => {
    const station = makeStation(STATION_UUID, undefined);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderWalkbackLines();
    expect(walkbackSource!.getFeatures()).toHaveLength(0);
  });

  it("removes its walkback layer from the map on unmount", () => {
    store = makeStore();
    renderWalkbackLines();
    expect(findWalkbackLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findWalkbackLayer()).toBeNull();
  });

  describe("click handler", () => {
    it("click on walkback selects the station via setSelectedStationUuid + setSectionSelected", () => {
      const station = makeStation(STATION_UUID, [
        { lat: 10, lng: 20 },
        { lat: 11, lng: 21 },
      ]);
      mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

      store = makeStore({
        station: {
          ...stationSlice.getInitialState(),
          // Selected so the walkback feature actually renders (visibility gated
          // on selectedStationUuid + sectionSelectedLabel ∈ {station, evas})
          selectedStationUuid: STATION_UUID,
        },
        interface: {
          ...interfaceSlice.getInitialState(),
          sectionSelectedLabel: "evas",
        },
      } as PartialPreloadedState);

      renderWalkbackLines();
      const layer = findWalkbackLayer()!;
      const features = walkbackSource!.getFeatures();
      expect(features).toHaveLength(1);
      const feature = features[0];
      // Walkback click handler reads `stationUuid` property, NOT feature id
      expect(feature.get("stationUuid")).toBe(STATION_UUID);

      vi.spyOn(map, "forEachFeatureAtPixel").mockImplementation(
        (_pixel, callback, opts: unknown) => {
          const layerFilter = (opts as { layerFilter?: (l: unknown) => boolean })?.layerFilter;
          if (!layerFilter || layerFilter(layer)) {
            return (callback as (f: unknown) => unknown)(feature);
          }
          return undefined;
        }
      );

      flushSync(() => {
        dispatchMapClick(map, [50, 50], [20000, 10000]);
      });

      const state = store.getState();
      // Click handler dispatched setSectionSelected("station")
      expect(state.interface.sectionSelectedLabel).toBe("station");
      expect(state.station.selectedStationUuid).toBe(STATION_UUID);
    });

    it("does NOT change selection when click misses all walkback features", () => {
      const station = makeStation(STATION_UUID, [
        { lat: 10, lng: 20 },
        { lat: 11, lng: 21 },
      ]);
      mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

      store = makeStore({
        station: {
          ...stationSlice.getInitialState(),
          selectedStationUuid: STATION_UUID,
        },
        interface: {
          ...interfaceSlice.getInitialState(),
          sectionSelectedLabel: "evas",
        },
      } as PartialPreloadedState);

      renderWalkbackLines();
      vi.spyOn(map, "forEachFeatureAtPixel").mockReturnValue(undefined);

      dispatchMapClick(map, [9999, 9999], [99999, 99999]);

      // Section unchanged — handler bailed because no hit
      expect(store.getState().interface.sectionSelectedLabel).toBe("evas");
    });
  });
});
