/**
 * Browser-mode tests for `ScaleBar`.
 *
 * Mounts the ScaleBar against a hand-rolled OL Map (via MapContext directly,
 * bypassing the full MapProvider which needs an Automerge mission doc). The
 * scale bar derives its width from ground resolution and shares a readout with the grid interval.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import { fromLonLat } from "ol/proj";
import { MapContext } from "components/interface/map/MapProvider";
import { MapDistanceOverlays } from "components/interface/map/overlays/MapDistanceOverlays";
import { ScaleBar } from "components/interface/map/overlays/ScaleBar";
import { GRID_INTERVAL_PROPERTY } from "components/interface/map/utils/mapScale";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;

/** Render the ScaleBar and wait for the post-mount effect to flush
 *  (effect calls setScale → triggers a re-render that emits the DOM). */
async function renderScaleBar(planetRadius = 6378137): Promise<HTMLDivElement | null> {
  harness.render(
    <MapContext.Provider value={{ map, mode: "editor", planetRadius }}>
      <ScaleBar className="scaleBarTest" />
    </MapContext.Provider>
  );
  await new Promise((r) => setTimeout(r, 0));
  // Re-render to drain any pending state updates from the effect
  harness.render(
    <MapContext.Provider value={{ map, mode: "editor", planetRadius }}>
      <ScaleBar className="scaleBarTest" />
    </MapContext.Provider>
  );
  return harness.container.querySelector<HTMLDivElement>(".scaleBarTest");
}

function scaleGraphic(): HTMLDivElement {
  return harness.container.querySelector<HTMLDivElement>('[role="img"]')!;
}

beforeEach(() => {
  harness = createReactHarness();

  // The OL Map needs a real DOM element with non-zero size.
  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({
      projection: "EPSG:3857",
      center: [0, 0],
      // resolution must be set so ScaleBar can render
      resolution: 10, // 10 m/px
    }),
  });
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

describe("ScaleBar", () => {
  it("renders nothing when the view has no resolution", async () => {
    map.setView(new View({ projection: "EPSG:3857", center: [0, 0] }));
    const el = await renderScaleBar();
    expect(el).toBeNull();
  });

  it("renders a scale bar with a label and a positive width", async () => {
    const el = await renderScaleBar();
    expect(el).not.toBeNull();
    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 1 km");
    expect(parseFloat(scaleGraphic().style.width)).toBeCloseTo(100);
    expect(scaleGraphic().children[1].children).toHaveLength(4);
    const labelStyle = getComputedStyle(scaleGraphic().firstElementChild!);
    expect(parseFloat(labelStyle.fontSize)).toBeCloseTo(
      parseFloat(getComputedStyle(scaleGraphic()).fontSize) * 0.8
    );
    expect(labelStyle.fontWeight).toBe("400");
  });

  it("centers the endpoint numbers above the bar and the unit below it", async () => {
    map.getView().setResolution(2); // 2 m/px → 200m target → label in m
    await renderScaleBar();
    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 200 m");
    const [labels, bar, unit] = Array.from(scaleGraphic().children);
    const [start, end] = Array.from(labels.children);
    const bounds = bar.getBoundingClientRect();
    const centerX = (element: Element) => {
      const { left, width } = element.getBoundingClientRect();
      return left + width / 2;
    };
    expect(start.textContent).toBe("0");
    expect(end.textContent).toBe("200");
    expect(centerX(start)).toBeCloseTo(bounds.left, 1);
    expect(centerX(end)).toBeCloseTo(bounds.right, 1);
    expect(labels.getBoundingClientRect().bottom).toBeLessThan(bounds.top);
    expect(unit.textContent).toBe("meters");
    expect(getComputedStyle(unit).textAlign).toBe("center");
    expect(unit.getBoundingClientRect().top).toBeGreaterThan(bounds.bottom);
  });

  it("uses 'km' unit when the rounded distance is >= 1000 m", async () => {
    map.getView().setResolution(50); // 50 m/px * 100 = 5000 m → km
    await renderScaleBar();
    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 5 km");
    expect(scaleGraphic().lastElementChild?.textContent).toBe("kilometers");
  });

  it("updates the label and width when the view resolution changes (moveend)", async () => {
    await renderScaleBar();
    const width1 = scaleGraphic().style.width;

    flushSync(() => {
      map.getView().setResolution(500); // very zoomed out → km label
      map.dispatchEvent("moveend");
    });

    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 50 km");
    expect(parseFloat(scaleGraphic().style.width)).toBeCloseTo(parseFloat(width1));
  });

  it("rounds resolutions to 'nice' values (1, 2, 5, 10, ...)", async () => {
    map.getView().setResolution(7);
    await renderScaleBar();
    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 500 m");
    expect(scaleGraphic().children[1].children).toHaveLength(5);
  });

  it("accounts for both the mission radius and Mercator distortion", async () => {
    map.getView().setCenter(fromLonLat([0, 60]));
    await renderScaleBar(1737400);

    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 100 m");
    expect(parseFloat(scaleGraphic().style.width)).toBeCloseTo(100 / ((5 * 1737400) / 6378137));
  });

  it("shows the grid interval and scale bar in one box with a divider", async () => {
    map.set(GRID_INTERVAL_PROPERTY, 100);
    const renderOverlays = (showScaleBar: boolean) => {
      harness.render(
        <MapContext.Provider value={{ map, mode: "editor", planetRadius: 6378137 }}>
          <MapDistanceOverlays showScaleBar={showScaleBar} />
        </MapContext.Provider>
      );
    };
    renderOverlays(true);
    await expect.poll(() => scaleGraphic()?.getAttribute("aria-label")).toBe("Map scale 1 km");
    const bar = scaleGraphic();
    const scaleRow = bar.parentElement!;
    const intervalRow = scaleRow.previousElementSibling!;
    const readout = scaleRow.parentElement!;
    const scaleWidth = bar.getBoundingClientRect().width;
    expect(intervalRow.textContent).toBe("Grid 100m");
    expect(readout.children).toHaveLength(2);
    expect(getComputedStyle(readout).backgroundColor).toBe("rgb(66, 70, 83)");
    expect(getComputedStyle(intervalRow).borderBottomWidth).toBe("1px");
    expect(getComputedStyle(scaleRow).borderTopWidth).toBe("0px");

    flushSync(() => {
      map.getView().setResolution(8.3);
      map.dispatchEvent("moveend");
    });
    expect(bar.getBoundingClientRect().width).toBeLessThan(scaleWidth);
    expect(scaleRow.getBoundingClientRect().width).toBe(intervalRow.getBoundingClientRect().width);
    expect(intervalRow.textContent).toBe("Grid 100m");

    renderOverlays(false);
    expect(scaleGraphic()).toBeNull();
    flushSync(() => map.set(GRID_INTERVAL_PROPERTY, "lgrs-zones"));
    expect(intervalRow.textContent).toBe("LGRS zones");
    flushSync(() => map.set(GRID_INTERVAL_PROPERTY, null));
    expect(harness.container.contains(intervalRow)).toBe(false);
    expect(getComputedStyle(readout).display).toBe("none");
  });

  it("removes its moveend listener on unmount (no leak)", async () => {
    const unSpy = vi.spyOn(map, "un");
    await renderScaleBar();

    flushSync(() => harness.root.unmount());

    const unCalls = unSpy.mock.calls.filter((c) => (c[0] as unknown as string) === "moveend");
    expect(unCalls.length).toBeGreaterThanOrEqual(1);
  });
});
