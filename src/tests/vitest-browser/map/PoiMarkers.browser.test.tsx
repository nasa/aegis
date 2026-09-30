/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `PoiMarkers`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map, a Redux store
 * with the minimal slices the component reads, and real
 * FeatureSourcesProvider / MapMenuProvider contexts.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * Verifies:
 *  - POI VectorLayer added at POIS z-index
 *  - POI features placed on shared poiSource when display is on
 *  - Selected POI shown even when mapDisplayPois.show=false
 *  - Features cleared when display toggled off and nothing selected
 *  - Feature properties (mapItemType, emoji, name) set correctly
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
import { PoiMarkers } from "components/interface/map/behaviors/PoiMarkers";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { poiSlice } from "store/poi";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { stationSlice } from "store/station";
import { evaSlice } from "store/eva";
import { traverseSlice } from "store/traverse";
import { rexSlice } from "store/rex";
import { measureSlice } from "store/measure";
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

const thunkMarkerOnClickMock = vi.fn((_args: unknown) => ({
  type: "mock/thunkMarkerOnClick",
}));
vi.mock("store/thunk/thunkMap", () => ({
  thunkMarkerOnClick: (args: unknown) => thunkMarkerOnClickMock(args),
}));

const thunkUpdatePoiLocationMock = vi.fn((_args: unknown) => ({
  type: "mock/thunkUpdatePoiLocation",
}));
vi.mock("store/thunk/thunkPoi", () => ({
  thunkDocUpdatePoiLocation: (args: unknown) => thunkUpdatePoiLocationMock(args),
}));

// Mutable mock Automerge doc — tests populate pois here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const POI_UUID_A = "poi-uuid-pm-1";
const POI_UUID_B = "poi-uuid-pm-2";
const FOLDER_UUID = "poi-folder-1";

function makePoi(uuid: string, lat: number, lng: number, icon = "1f534"): POI {
  return {
    uuid,
    name: `POI ${uuid.slice(-1)}`,
    icon,
    location: { lat, lng },
    updatedAt: new Date().toISOString(),
  } as unknown as POI;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      poi: poiSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      station: stationSlice.reducer,
      eva: evaSlice.reducer,
      traverse: traverseSlice.reducer,
      rex: rexSlice.reducer,
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

let poiSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceAndSetterCapture(): null {
  poiSource = useFeatureSourcesContext().poiSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findPoiLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.POIS) as VectorLayer<VectorSource> | undefined) ??
    null
  );
}

let testCookies: Cookies;

function renderPoiMarkers(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode }}>
              <PoiMarkers />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  poiSource = null;
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

describe("PoiMarkers", () => {
  it("adds a POI VectorLayer at POIS z-index", () => {
    store = makeStore();
    renderPoiMarkers();
    const layer = findPoiLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.POIS);
  });

  it("places POI features on the shared poiSource when display is on", () => {
    const poiA = makePoi(POI_UUID_A, 10, 20);
    mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

    store = makeStore();

    renderPoiMarkers();

    expect(poiSource).not.toBeNull();
    const features = poiSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(POI_UUID_A);
  });

  it("sets correct feature properties (mapItemType, emoji, name)", () => {
    const poiA = makePoi(POI_UUID_A, 10, 20, "1f50d");
    mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

    store = makeStore();

    renderPoiMarkers();

    const feature = poiSource!.getFeatureById(POI_UUID_A)!;
    expect(feature).not.toBeNull();
    expect(feature.get("mapItemType")).toBe("poi");
    expect(feature.get("emoji")).toBe("1f50d");
    expect(feature.get("name")).toBe(`POI ${POI_UUID_A.slice(-1)}`);
  });

  it("shows no features when mapDisplayPois.show=false and no POI is selected", () => {
    const poiA = makePoi(POI_UUID_A, 10, 20);
    mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

    store = makeStore();

    renderPoiMarkers();

    // Toggle display off
    flushSync(() => {
      capturedSetters!.setSubmenuPois({ show: false, showLabels: false });
    });

    // No section selected for poi, no selectedPoiUuid → nothing shown
    expect(poiSource!.getFeatures()).toHaveLength(0);
  });

  it("shows selected POI even when mapDisplayPois.show=false (sectionSelected=poi)", () => {
    const poiA = makePoi(POI_UUID_A, 10, 20);
    mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

    store = makeStore({
      poi: {
        ...poiSlice.getInitialState(),
        selectedPoiUuid: POI_UUID_A,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "poi",
      },
    } as PartialPreloadedState);

    renderPoiMarkers();

    // Toggle display off — selected POI should still appear
    flushSync(() => {
      capturedSetters!.setSubmenuPois({ show: false, showLabels: false });
    });

    const features = poiSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(POI_UUID_A);
  });

  it("hides POIs in a hidden folder when display is on", () => {
    const poiA = makePoi(POI_UUID_A, 10, 20);
    const poiB = makePoi(POI_UUID_B, 15, 25);
    mockMissionDoc.pois = {
      [POI_UUID_A]: poiA,
      [POI_UUID_B]: poiB,
    } as unknown as Mission["pois"];

    store = makeStore({
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "preset",
        folders: [
          {
            uuid: FOLDER_UUID,
            type: "poi",
            items: [POI_UUID_B],
            name: "Hidden Folder",
          },
        ],
        foldersInterface: [{ uuid: FOLDER_UUID, visible: false }],
      },
    } as PartialPreloadedState);

    renderPoiMarkers();

    // poiA not in any folder → shown; poiB in hidden folder → hidden
    const features = poiSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(POI_UUID_A);
  });

  it("skips POIs with missing location", () => {
    const badPoi = {
      ...makePoi(POI_UUID_A, 0, 0),
      location: null,
    } as unknown as POI;
    mockMissionDoc.pois = { [POI_UUID_A]: badPoi } as unknown as Mission["pois"];

    store = makeStore();

    renderPoiMarkers();
    expect(poiSource!.getFeatures()).toHaveLength(0);
  });

  it("removes its POI layer from the map on unmount", () => {
    store = makeStore();
    renderPoiMarkers();
    expect(findPoiLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findPoiLayer()).toBeNull();
  });

  describe("click handler (editor mode)", () => {
    beforeEach(() => {
      thunkMarkerOnClickMock.mockClear();
    });

    it("dispatches thunkMarkerOnClick with POI uuid when click hits a POI", () => {
      const poiA = makePoi(POI_UUID_A, 10, 20);
      mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

      store = makeStore();

      renderPoiMarkers();
      const layer = findPoiLayer()!;
      const feature = poiSource!.getFeatureById(POI_UUID_A)!;
      expect(feature).not.toBeNull();

      vi.spyOn(map, "forEachFeatureAtPixel").mockImplementation(
        (_pixel, callback, opts: unknown) => {
          const layerFilter = (opts as { layerFilter?: (l: unknown) => boolean })?.layerFilter;
          if (!layerFilter || layerFilter(layer)) {
            return (callback as (f: unknown) => unknown)(feature);
          }
          return undefined;
        }
      );

      dispatchMapClick(map, [50, 50], [20000, 10000]);

      expect(thunkMarkerOnClickMock).toHaveBeenCalledTimes(1);
      expect(thunkMarkerOnClickMock).toHaveBeenCalledWith({
        markerUuid: POI_UUID_A,
        mapItemType: "poi",
      });
    });

    it("does NOT dispatch when click misses all POI features", () => {
      const poiA = makePoi(POI_UUID_A, 10, 20);
      mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

      store = makeStore();

      renderPoiMarkers();
      vi.spyOn(map, "forEachFeatureAtPixel").mockReturnValue(undefined);

      dispatchMapClick(map, [9999, 9999], [99999, 99999]);

      expect(thunkMarkerOnClickMock).not.toHaveBeenCalled();
    });
  });

  describe("drag interaction", () => {
    beforeEach(() => {
      thunkUpdatePoiLocationMock.mockClear();
    });

    it("translateend dispatches thunkUpdatePoiLocation with new coordinates", async () => {
      const { Collection } = await import("ol");
      const { default: Feature } = await import("ol/Feature");
      const { default: Point } = await import("ol/geom/Point");
      const poiA = makePoi(POI_UUID_A, 10, 20);
      mockMissionDoc.pois = { [POI_UUID_A]: poiA } as unknown as Mission["pois"];

      store = makeStore({
        poi: {
          ...poiSlice.getInitialState(),
          selectedPoiUuid: POI_UUID_A,
        },
      } as PartialPreloadedState);

      renderPoiMarkers();

      const interactions = map.getInteractions().getArray();
      const translate = interactions[interactions.length - 1] as {
        dispatchEvent: (e: unknown) => void;
      };

      const movedFeature = new Feature(new Point([55000, 33000]));
      movedFeature.setId(POI_UUID_A);

      translate.dispatchEvent({
        type: "translateend",
        features: new Collection([movedFeature]),
      });

      expect(thunkUpdatePoiLocationMock).toHaveBeenCalledTimes(1);
      const payload = thunkUpdatePoiLocationMock.mock.calls[0]?.[0] as {
        location: { lat: number; lng: number };
        poiUuid: string;
      };
      expect(payload.poiUuid).toBe(POI_UUID_A);
      expect(payload.location.lat).toBeCloseTo(33, 5);
      expect(payload.location.lng).toBeCloseTo(55, 5);
    });
  });
});
