/**
 * Browser-mode tests for `HoverHighlight`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map and a real Redux
 * store with just the hover slice. Verifies the layer is added to the map,
 * a circle highlight is drawn for hovered Point features, an overlay polyline
 * is drawn for hovered LineString features, and the highlight clears when
 * the hover state clears.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import { Point, LineString } from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";

import { MapContext } from "components/interface/map/MapProvider";
import { HoverHighlight } from "components/interface/map/behaviors/HoverHighlight";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { hoverSlice } from "store/hover";
import { rexSlice } from "store/rex";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// HoverHighlight resolves POS-entry locations from the mission doc and projects
// them via useCoordConverters — mock both so the store-only harness doesn't need
// the full Automerge/projection stack.
vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

const STATION_UUID = "station-uuid-1";
const TRAVERSE_UUID = "traverse-uuid-1";

function makeStore() {
  return configureStore({
    reducer: { hover: hoverSlice.reducer, rex: rexSlice.reducer },
  });
}

/** Add a vector layer with the given features and return the layer. */
function addLayerWithFeatures(features: Feature[]): VectorLayer<VectorSource> {
  const source = new VectorSource({ features });
  const layer = new VectorLayer({ source });
  map.addLayer(layer);
  return layer;
}

/** Find the layer added by HoverHighlight (matches Z_INDEX.HOVER zIndex). */
function findHoverLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.HOVER) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderHoverHighlight(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <MapContext.Provider value={{ map, mode }}>
        <HoverHighlight />
      </MapContext.Provider>
    </Provider>
  );
}

beforeEach(() => {
  store = makeStore();
  harness = createReactHarness();

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

describe("HoverHighlight", () => {
  it("adds a hover-overlay vector layer to the map (editor mode)", () => {
    renderHoverHighlight();
    const layer = findHoverLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.HOVER);
  });

  it("does NOT add a hover layer in non-editor modes", () => {
    renderHoverHighlight("dashboard");
    expect(findHoverLayer()).toBeNull();
  });

  it("draws a circle highlight around a hovered Point feature", async () => {
    const stationFeature = new Feature(new Point([100, 200]));
    stationFeature.setId(STATION_UUID);
    addLayerWithFeatures([stationFeature]);

    renderHoverHighlight();

    const { flushSync } = await import("react-dom");
    flushSync(() => {
      store.dispatch(hoverSlice.actions.setMapItemHoverUuid(STATION_UUID));
      store.dispatch(hoverSlice.actions.setMapItemHoverType("station"));
    });

    const layer = findHoverLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);
    const geom = features[0].getGeometry();
    expect(geom).toBeInstanceOf(Point);
    expect((geom as Point).getCoordinates()).toEqual([100, 200]);
    expect(features[0].getId()).toBe(`hover-${STATION_UUID}`);
  });

  it("draws an overlay polyline around a hovered LineString feature", async () => {
    const path: [number, number][] = [
      [0, 0],
      [50, 50],
      [100, 0],
    ];
    const traverseFeature = new Feature(new LineString(path));
    traverseFeature.setId(TRAVERSE_UUID);
    addLayerWithFeatures([traverseFeature]);

    renderHoverHighlight();

    const { flushSync } = await import("react-dom");
    flushSync(() => {
      store.dispatch(hoverSlice.actions.setMapItemHoverUuid(TRAVERSE_UUID));
      store.dispatch(hoverSlice.actions.setMapItemHoverType("traverse"));
    });

    const layer = findHoverLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);
    const geom = features[0].getGeometry();
    expect(geom).toBeInstanceOf(LineString);
    expect((geom as LineString).getCoordinates()).toEqual(path);
  });

  it("clears the highlight when the hover state clears", async () => {
    const stationFeature = new Feature(new Point([10, 10]));
    stationFeature.setId(STATION_UUID);
    addLayerWithFeatures([stationFeature]);

    renderHoverHighlight();

    const { flushSync } = await import("react-dom");
    flushSync(() => {
      store.dispatch(hoverSlice.actions.setMapItemHoverUuid(STATION_UUID));
      store.dispatch(hoverSlice.actions.setMapItemHoverType("station"));
    });

    const layer = findHoverLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(1);

    flushSync(() => {
      store.dispatch(hoverSlice.actions.clearMapItemHover());
    });

    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("does nothing when the hovered uuid is not present in any layer", async () => {
    renderHoverHighlight();

    const { flushSync } = await import("react-dom");
    flushSync(() => {
      store.dispatch(hoverSlice.actions.setMapItemHoverUuid("does-not-exist"));
      store.dispatch(hoverSlice.actions.setMapItemHoverType("station"));
    });

    const layer = findHoverLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("removes its hover layer from the map on unmount", () => {
    renderHoverHighlight();
    expect(findHoverLayer()).not.toBeNull();

    harness.unmount();
    // create a fresh harness so afterEach unmount does not double-unmount
    harness = createReactHarness();

    expect(findHoverLayer()).toBeNull();
  });
});
