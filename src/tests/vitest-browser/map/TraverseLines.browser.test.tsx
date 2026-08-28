/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `TraverseLines`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map, a Redux store
 * with the minimal slices the component reads, and real
 * FeatureSourcesProvider / MapMenuProvider contexts.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * Verifies:
 *  - Traverse VectorLayer added at POLYLINES z-index
 *  - Traverse features added to traverseSource when EVA is selected
 *  - No features when sectionSelected !== "evas"
 *  - Features cleared when EVA deselected
 *  - Traverse feature properties (color, mapItemType) set correctly
 *  - Layer removed on unmount
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { CookiesProvider } from "react-cookie";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { LineString } from "ol/geom";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider } from "components/interface/map/MapMenuProvider";
import { TraverseLines } from "components/interface/map/behaviors/TraverseLines";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { traverseSlice } from "store/traverse";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { stationSlice } from "store/station";
import { poiSlice } from "store/poi";
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

// Mutable mock Automerge doc — tests populate traverses/evas here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

const thunkPolylineOnClickMock = vi.fn((_args: unknown) => ({
  type: "mock/thunkPolylineOnClick",
}));
vi.mock("store/thunk/thunkMap", () => ({
  thunkPolylineOnClick: (args: unknown) => thunkPolylineOnClickMock(args),
}));

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TRAVERSE_UUID = "traverse-uuid-1";
const EVA_UUID = "eva-uuid-tl-1";

function makeTraverse(uuid: string, color: string = "#03adfc"): Traverse {
  return {
    uuid,
    name: `Traverse ${uuid.slice(-1)}`,
    color,
    path: [
      { lat: 10, lng: 20 },
      { lat: 11, lng: 21 },
      { lat: 12, lng: 22 },
    ],
    updatedAt: new Date().toISOString(),
    refUuid: null,
  } as unknown as Traverse;
}

function makeEva(uuid: string, traverseUuids: string[]): Eva {
  return {
    uuid,
    name: "Test EVA",
    traverseColor: "#aabbcc",
    sequence: traverseUuids.map((u) => ({ uuid: u, type: "traverse" })),
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
      traverse: traverseSlice.reducer,
      eva: evaSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      station: stationSlice.reducer,
      poi: poiSlice.reducer,
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

let traverseSource: VectorSource | null = null;

function SourceCapture(): null {
  traverseSource = useFeatureSourcesContext().traverseSource;
  return null;
}

function findTraverseLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.POLYLINES) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderTraverseLines(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceCapture />
            <MapContext.Provider value={{ map, mode }}>
              <TraverseLines />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  traverseSource = null;
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

describe("TraverseLines", () => {
  it("adds a traverse VectorLayer at POLYLINES z-index", () => {
    store = makeStore();
    renderTraverseLines();
    const layer = findTraverseLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.POLYLINES);
  });

  it("adds no traverse features when sectionSelected is not 'evas'", () => {
    const traverse = makeTraverse(TRAVERSE_UUID);
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "preset", // not "evas"
      },
    } as PartialPreloadedState);

    renderTraverseLines();

    expect(traverseSource!.getFeatures()).toHaveLength(0);
  });

  it("renders traverse feature on source when EVA is selected and section is 'evas'", () => {
    const traverse = makeTraverse(TRAVERSE_UUID, "#ff6600");
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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

    renderTraverseLines();

    expect(traverseSource).not.toBeNull();
    const features = traverseSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(TRAVERSE_UUID);
  });

  it("traverse feature has LineString geometry with projected coordinates", () => {
    const traverse = makeTraverse(TRAVERSE_UUID);
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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

    renderTraverseLines();

    const feature = traverseSource!.getFeatureById(TRAVERSE_UUID)!;
    expect(feature).not.toBeNull();
    const geom = feature.getGeometry() as LineString;
    expect(geom.getType()).toBe("LineString");
    // path = [{lat:10,lng:20}, {lat:11,lng:21}, {lat:12,lng:22}]
    // toMapCoord → [lng*1000, lat*1000]
    expect(geom.getCoordinates()).toEqual([
      [20000, 10000],
      [21000, 11000],
      [22000, 12000],
    ]);
  });

  it("traverse feature has the traverse-specific color property", () => {
    const traverse = makeTraverse(TRAVERSE_UUID, "#ab1234");
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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

    renderTraverseLines();

    const feature = traverseSource!.getFeatureById(TRAVERSE_UUID)!;
    expect(feature.get("color")).toBe("#ab1234");
    expect(feature.get("mapItemType")).toBe("traverse");
  });

  it("falls back to EVA traverseColor when traverse has no color", () => {
    const traverse = {
      ...makeTraverse(TRAVERSE_UUID),
      color: undefined,
    } as unknown as Traverse;
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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

    renderTraverseLines();

    const feature = traverseSource!.getFeatureById(TRAVERSE_UUID)!;
    // eva.traverseColor is "#aabbcc"; no traverse.color → feature uses eva's
    expect(feature.get("color")).toBe("#aabbcc");
  });

  it("clears all features when EVA is deselected", () => {
    const traverse = makeTraverse(TRAVERSE_UUID);
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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

    renderTraverseLines();
    expect(traverseSource!.getFeatures()).toHaveLength(1);

    flushSync(() => {
      store.dispatch(interfaceSlice.actions.setSectionSelected("preset"));
    });

    expect(traverseSource!.getFeatures()).toHaveLength(0);
  });

  it("skips traverses with fewer than 2 path points", () => {
    const shortTraverse = {
      ...makeTraverse(TRAVERSE_UUID),
      path: [{ lat: 10, lng: 20 }], // only 1 point — invalid polyline
    } as unknown as Traverse;
    const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
    mockMissionDoc.traverses = {
      [TRAVERSE_UUID]: shortTraverse,
    } as unknown as Mission["traverses"];
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

    renderTraverseLines();
    expect(traverseSource!.getFeatures()).toHaveLength(0);
  });

  it("removes its traverse layer from the map on unmount", () => {
    store = makeStore();
    renderTraverseLines();
    expect(findTraverseLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findTraverseLayer()).toBeNull();
  });

  describe("click handler (editor mode)", () => {
    beforeEach(() => {
      thunkPolylineOnClickMock.mockClear();
    });

    it("dispatches thunkPolylineOnClick when click hits a traverse line", () => {
      const traverse = makeTraverse(TRAVERSE_UUID);
      const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
      mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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

      renderTraverseLines();
      const layer = findTraverseLayer()!;
      const feature = traverseSource!.getFeatureById(TRAVERSE_UUID)!;
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

      expect(thunkPolylineOnClickMock).toHaveBeenCalledTimes(1);
      expect(thunkPolylineOnClickMock).toHaveBeenCalledWith({
        polylineUuid: TRAVERSE_UUID,
        mapItemType: "traverse",
      });
    });

    it("does NOT dispatch when an editPolyline directive is active", () => {
      const traverse = makeTraverse(TRAVERSE_UUID);
      const eva = makeEva(EVA_UUID, [TRAVERSE_UUID]);
      mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
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
        map: {
          ...mapSlice.getInitialState(),
          mapDirective: {
            uuid: TRAVERSE_UUID,
            mapItemType: "traverse",
            mapAction: "editPolyline",
          },
        },
      } as PartialPreloadedState);

      renderTraverseLines();
      const layer = findTraverseLayer()!;
      const feature = traverseSource!.getFeatureById(TRAVERSE_UUID)!;

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

      // Click handler is unregistered while editPolyline is active
      expect(thunkPolylineOnClickMock).not.toHaveBeenCalled();
    });
  });
});
