/**
 * Browser-mode tests for `LanderMarker`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map.
 *
 * Mocks:
 *  - `useCoordConverters` (avoids Automerge dependency)
 *  - `utils/useDocSelector` — `useMissionDocSelector` reads `landerLocation`
 *    directly from the mission Automerge doc; we provide a settable mutable
 *    fixture so tests can control what gets returned.
 *
 * Verifies:
 *  - VectorLayer added at LANDER z-index
 *  - Lander Feature created at the projected coordinate
 *  - Feature id is "lander"
 *  - Position updates when landerLocation changes (no feature recreation)
 *  - No feature created when landerLocation is null/missing fields
 *  - Layer removed on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Point } from "ol/geom";

import { MapContext } from "components/interface/map/MapProvider";
import { LanderMarker } from "components/interface/map/behaviors/LanderMarker";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
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

// Mutable mission-doc fixture — tests set fields then re-render to read them.
const mockMissionDoc: { landerLocation: AEGISPoint | null } = { landerLocation: null };

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function makeStore() {
  return configureStore({
    reducer: {
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
    },
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

function findLanderLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.LANDER) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderLanderMarker(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <MapContext.Provider value={{ map, mode }}>
        <LanderMarker />
      </MapContext.Provider>
    </Provider>
  );
}

beforeEach(() => {
  mockMissionDoc.landerLocation = null;
  harness = createReactHarness();
  store = makeStore();

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

describe("LanderMarker", () => {
  it("adds a lander VectorLayer at LANDER z-index", () => {
    renderLanderMarker();
    const layer = findLanderLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.LANDER);
  });

  it("renders no feature when landerLocation is null", () => {
    mockMissionDoc.landerLocation = null;
    renderLanderMarker();
    const layer = findLanderLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("renders no feature when landerLocation has missing lat/lng", () => {
    mockMissionDoc.landerLocation = { lat: null, lng: null } as unknown as AEGISPoint;
    renderLanderMarker();
    const layer = findLanderLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("renders the lander feature at the projected coordinate", () => {
    mockMissionDoc.landerLocation = { lat: 12, lng: 34 };
    renderLanderMarker();

    const layer = findLanderLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe("lander");

    const geom = features[0].getGeometry() as Point;
    // toMapCoord({lat:12, lng:34}) → [34000, 12000]
    expect(geom.getCoordinates()).toEqual([34000, 12000]);
  });

  it("updates the lander position when landerLocation changes (no feature recreation)", () => {
    mockMissionDoc.landerLocation = { lat: 1, lng: 2 };
    renderLanderMarker();

    const layer = findLanderLayer()!;
    const featureBefore = layer.getSource()!.getFeatures()[0];
    expect(featureBefore.getId()).toBe("lander");
    expect((featureBefore.getGeometry() as Point).getCoordinates()).toEqual([2000, 1000]);

    // Change the lander location and re-render — same feature should be reused.
    mockMissionDoc.landerLocation = { lat: 5, lng: 6 };
    renderLanderMarker();

    const featureAfter = layer.getSource()!.getFeatures()[0];
    expect(featureAfter).toBe(featureBefore); // same Feature instance
    expect((featureAfter.getGeometry() as Point).getCoordinates()).toEqual([6000, 5000]);
  });

  it("clears the lander feature when landerLocation transitions to null", () => {
    mockMissionDoc.landerLocation = { lat: 1, lng: 2 };
    renderLanderMarker();
    expect(findLanderLayer()!.getSource()!.getFeatures()).toHaveLength(1);

    mockMissionDoc.landerLocation = null;
    renderLanderMarker();
    expect(findLanderLayer()!.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("removes the lander layer on unmount", () => {
    mockMissionDoc.landerLocation = { lat: 1, lng: 2 };
    renderLanderMarker();
    expect(findLanderLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findLanderLayer()).toBeNull();
  });
});
