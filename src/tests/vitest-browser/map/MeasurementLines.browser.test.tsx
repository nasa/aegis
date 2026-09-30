/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `MeasurementLines`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map and a Redux store
 * with the minimal slices the component reads, plus FeatureSourcesProvider.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * Verifies:
 *  - Measurement VectorLayer added at POLYLINES z-index
 *  - No features when no measurement is selected
 *  - LineString feature rendered for selected measurement
 *  - Skips measurements with fewer than 2 path points
 *  - Color and mapItemType properties set on the feature
 *  - Cleared when selection cleared
 *  - measureInitialCoords dispatched on mount
 *  - measureInitialCoords updated on map moveend
 *  - Layer removed on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
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
import { MeasurementLines } from "components/interface/map/behaviors/MeasurementLines";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { measureSlice } from "store/measure";
import { mapSlice } from "store/map";
import type * as UseDocSelectorModule from "utils/useDocSelector";
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

// MeasurementLines reads planetRadius via useMissionDocSelector; stub it to a
// fixed radius so the geodesic label fallbacks don't require an Automerge repo.
vi.mock("utils/useDocSelector", async (importOriginal) => {
  const actual = await importOriginal<typeof UseDocSelectorModule>();
  return {
    ...actual,
    useMissionDocSelector: (selector: (m: { planetRadius: number }) => unknown) =>
      selector({ planetRadius: 1737400 }),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEAS_UUID_A = "meas-uuid-1";
const MEAS_UUID_B = "meas-uuid-2";

function makeMeasurement(uuid: string, color = "#00ff00"): Measurement {
  return {
    uuid,
    name: `Measurement ${uuid.slice(-1)}`,
    color,
    path: [
      { lat: 5, lng: 6 },
      { lat: 7, lng: 8 },
    ],
    updatedAt: new Date().toISOString(),
  } as unknown as Measurement;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      measure: measureSlice.reducer,
      map: mapSlice.reducer,
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

let measurementSource: VectorSource | null = null;

function SourceCapture(): null {
  measurementSource = useFeatureSourcesContext().measurementSource;
  return null;
}

function findMeasurementLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.POLYLINES) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderMeasurementLines(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <FeatureSourcesProvider>
        <SourceCapture />
        <MapContext.Provider value={{ map, mode }}>
          <MeasurementLines />
        </MapContext.Provider>
      </FeatureSourcesProvider>
    </Provider>
  );
}

beforeEach(() => {
  measurementSource = null;
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "300px";
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

describe("MeasurementLines", () => {
  it("adds a measurement VectorLayer at POLYLINES z-index", () => {
    store = makeStore();
    renderMeasurementLines();
    const layer = findMeasurementLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.POLYLINES);
  });

  it("renders no features when nothing is selected", () => {
    const meas = makeMeasurement(MEAS_UUID_A);
    store = makeStore({
      measure: {
        ...measureSlice.getInitialState(),
        measurements: [meas],
        selectedMeasurementUuid: null,
      },
    } as PartialPreloadedState);

    renderMeasurementLines();
    expect(measurementSource!.getFeatures()).toHaveLength(0);
  });

  it("renders the selected measurement as a LineString feature", () => {
    const meas = makeMeasurement(MEAS_UUID_A, "#abcdef");
    store = makeStore({
      measure: {
        ...measureSlice.getInitialState(),
        measurements: [meas],
        selectedMeasurementUuid: MEAS_UUID_A,
      },
    } as PartialPreloadedState);

    renderMeasurementLines();

    const features = measurementSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(MEAS_UUID_A);
    expect(features[0].get("color")).toBe("#abcdef");
    expect(features[0].get("mapItemType")).toBe("measurement");

    const geom = features[0].getGeometry() as LineString;
    expect(geom.getType()).toBe("LineString");
    // path = [{lat:5,lng:6}, {lat:7,lng:8}] → [[6000, 5000], [8000, 7000]]
    expect(geom.getCoordinates()).toEqual([
      [6000, 5000],
      [8000, 7000],
    ]);
  });

  it("renders only the selected measurement, not the others", () => {
    const measA = makeMeasurement(MEAS_UUID_A);
    const measB = makeMeasurement(MEAS_UUID_B);
    store = makeStore({
      measure: {
        ...measureSlice.getInitialState(),
        measurements: [measA, measB],
        selectedMeasurementUuid: MEAS_UUID_B,
      },
    } as PartialPreloadedState);

    renderMeasurementLines();

    const features = measurementSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(MEAS_UUID_B);
  });

  it("skips measurements with fewer than 2 path points", () => {
    const meas = {
      ...makeMeasurement(MEAS_UUID_A),
      path: [{ lat: 1, lng: 2 }],
    } as unknown as Measurement;

    store = makeStore({
      measure: {
        ...measureSlice.getInitialState(),
        measurements: [meas],
        selectedMeasurementUuid: MEAS_UUID_A,
      },
    } as PartialPreloadedState);

    renderMeasurementLines();
    expect(measurementSource!.getFeatures()).toHaveLength(0);
  });

  it("clears the feature when selection is removed", () => {
    const meas = makeMeasurement(MEAS_UUID_A);
    store = makeStore({
      measure: {
        ...measureSlice.getInitialState(),
        measurements: [meas],
        selectedMeasurementUuid: MEAS_UUID_A,
      },
    } as PartialPreloadedState);

    renderMeasurementLines();
    expect(measurementSource!.getFeatures()).toHaveLength(1);

    flushSync(() => {
      store.dispatch(measureSlice.actions.setSelectedMeasurementUuid(null as unknown as string));
    });

    expect(measurementSource!.getFeatures()).toHaveLength(0);
  });

  it("dispatches setMeasureInitialCoords on map moveend with viewport-derived coords", async () => {
    store = makeStore();
    renderMeasurementLines();

    // Force a synchronous render so map.getSize() returns a valid size,
    // then fire moveend which re-runs the updateInitialCoords callback.
    map.updateSize();
    map.renderSync();
    map.dispatchEvent("moveend");

    const coords = store.getState().map.measureInitialCoords;
    expect(coords).toHaveLength(2);
    expect(coords[0].lat).toBeDefined();
    expect(coords[0].lng).toBeDefined();
    expect(coords[1].lat).toBeDefined();
    expect(coords[1].lng).toBeDefined();
    // Different coords for left vs right point
    expect(coords[0].lng).not.toBe(coords[1].lng);
  });

  it("updates measureInitialCoords when the map view center moves", async () => {
    store = makeStore();
    renderMeasurementLines();

    map.updateSize();
    map.renderSync();
    map.dispatchEvent("moveend");
    const before = store.getState().map.measureInitialCoords;
    expect(before).toHaveLength(2);

    // Pan the view, then trigger moveend
    map.getView().setCenter([5000, 5000]);
    map.renderSync();
    map.dispatchEvent("moveend");

    const after = store.getState().map.measureInitialCoords;
    // Coords should have changed because view center moved
    expect(after[0].lng).not.toBe(before[0].lng);
  });

  it("removes its layer from the map on unmount", () => {
    store = makeStore();
    renderMeasurementLines();
    expect(findMeasurementLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findMeasurementLayer()).toBeNull();
  });
});
