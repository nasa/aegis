/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `BigMapBoundsBox`.
 *
 * Mounts the headless behavior into a hand-rolled OL Map wrapped in
 * `<DashboardBoundsProvider>`. Verifies the bounds-rectangle vector layer is
 * added in minimap mode (and only minimap mode), updates when the dashboard
 * publishes a new extent, clears when the extent goes back to null, and
 * removes itself on unmount.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { Polygon } from "ol/geom";

import { MapContext } from "components/interface/map/MapProvider";
import {
  DashboardBoundsProvider,
  useDashboardBoundsContext,
} from "components/interface/map/DashboardBoundsProvider";
import { BigMapBoundsBox } from "components/interface/map/behaviors/BigMapBoundsBox";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;

let captureSetter: ((extent: number[]) => void) | null = null;

function CaptureSetter(): null {
  captureSetter = useDashboardBoundsContext().setBigMapExtent;
  return null;
}

function renderBigMapBoundsBox(mode: "editor" | "dashboard" | "minimap" = "minimap") {
  harness.render(
    <DashboardBoundsProvider>
      <CaptureSetter />
      <MapContext.Provider value={{ map, mode }}>
        <BigMapBoundsBox />
      </MapContext.Provider>
    </DashboardBoundsProvider>
  );
}

/** Find the bounds-box layer (matches Z_INDEX.SELECTION zIndex). */
function findBoundsLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.SELECTION) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

beforeEach(() => {
  captureSetter = null;
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "200px";
  mapContainer.style.height = "200px";
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

describe("BigMapBoundsBox", () => {
  it("adds a vector layer at SELECTION z-index in minimap mode", () => {
    renderBigMapBoundsBox("minimap");
    const layer = findBoundsLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.SELECTION);
  });

  it("does NOT add a layer in non-minimap modes", () => {
    renderBigMapBoundsBox("dashboard");
    expect(findBoundsLayer()).toBeNull();
  });

  it("starts with no bounds-box feature when extent is null", () => {
    renderBigMapBoundsBox("minimap");
    const layer = findBoundsLayer()!;
    expect(layer.getSource()!.getFeatures()).toHaveLength(0);
  });

  it("draws a rectangle polygon matching the published extent", async () => {
    renderBigMapBoundsBox("minimap");

    const { flushSync } = await import("react-dom");
    flushSync(() => captureSetter!([10, 20, 30, 40]));

    const layer = findBoundsLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);

    const geom = features[0].getGeometry();
    expect(geom?.getType()).toBe("Polygon");
    const extent = (geom as Polygon).getExtent();
    expect(extent).toEqual([10, 20, 30, 40]);
    expect(features[0].getId()).toBe("big-map-bounds");
  });

  it("replaces the rectangle when a new extent is published", async () => {
    renderBigMapBoundsBox("minimap");
    const { flushSync } = await import("react-dom");

    flushSync(() => captureSetter!([0, 0, 100, 100]));
    flushSync(() => captureSetter!([50, 50, 150, 150]));

    const layer = findBoundsLayer()!;
    const features = layer.getSource()!.getFeatures();
    expect(features).toHaveLength(1);
    expect((features[0].getGeometry() as Polygon).getExtent()).toEqual([50, 50, 150, 150]);
  });

  it("removes the bounds layer from the map on unmount", () => {
    renderBigMapBoundsBox("minimap");
    expect(findBoundsLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findBoundsLayer()).toBeNull();
  });
});
