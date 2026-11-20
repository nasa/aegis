/**
 * Browser-mode tests for `ScaleBar`.
 *
 * Mounts the ScaleBar against a hand-rolled OL Map (via MapContext directly,
 * bypassing the full MapProvider which needs an Automerge mission doc). The
 * scale bar derives its width from ground resolution and sits below the grid interval.
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
    expect(scaleGraphic().children[1].children).toHaveLength(2);
    const labelStyle = getComputedStyle(scaleGraphic().firstElementChild!);
    expect(parseFloat(labelStyle.fontSize)).toBeCloseTo(
      parseFloat(getComputedStyle(scaleGraphic()).fontSize) * 0.8
    );
    const endpointStyle = getComputedStyle(scaleGraphic().querySelector("span")!);
    expect(endpointStyle.fontWeight).toBe("600");
    expect(endpointStyle.color).toBe("rgb(255, 255, 255)");
    expect(endpointStyle.webkitTextStrokeWidth).toBe("2px");
    const bar = scaleGraphic().lastElementChild!;
    expect(getComputedStyle(bar).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(getComputedStyle(bar.children[1]).backgroundColor).toBe("rgb(17, 17, 17)");
  });

  it.each([
    { resolution: 0.54, step: 10, divisions: 5, symbol: "m" }, // formerly displayed 80 m
    { resolution: 0.7, step: 20, divisions: 5, symbol: "m" },
    { resolution: 1.5, step: 50, divisions: 4, symbol: "m" },
    { resolution: 7, step: 0.2, divisions: 5, symbol: "km" },
    { resolution: 50, step: 1, divisions: 5, symbol: "km" },
    { resolution: 0.068, step: 1, divisions: 10, symbol: "m" },
  ])(
    "centers labels at all the breaks with $divisions segments of $step $symbol",
    async ({ resolution, step, divisions, symbol }) => {
      map.getView().setResolution(resolution);
      await renderScaleBar();
      const [labels, bar] = Array.from(scaleGraphic().children);
      const values = Array.from(labels.children, (label) => label.firstElementChild!);
      const unit = labels.lastElementChild!.lastElementChild!;
      const numbers = new Intl.NumberFormat();
      const expected = Array.from({ length: divisions + 1 }, (_, index) =>
        numbers.format(index * step)
      );
      expect(scaleGraphic().getAttribute("aria-label")).toBe(
        `Map scale ${expected.at(-1)} ${symbol}`
      );
      expect(bar.children).toHaveLength(divisions);
      expect(values.map((label) => label.textContent)).toEqual(expected);

      const bounds = bar.getBoundingClientRect();
      expect(bounds.width).toBeCloseTo(
        (step * divisions * (symbol === "km" ? 1000 : 1)) / resolution,
        1
      );
      const breaks = Array.from(bar.children, (segment) => segment.getBoundingClientRect().left);
      breaks.push(bounds.right);
      const labelBounds = values.map((value) => value.getBoundingClientRect());
      for (const [index, labelBoundsAtTick] of labelBounds.entries()) {
        const { left, width } = labelBoundsAtTick;
        expect(left + width / 2).toBeCloseTo(breaks[index], 1);
        if (index > 0) expect(left - labelBounds[index - 1].right).toBeGreaterThan(2);
      }
      expect(unit.textContent).toBe(` ${symbol}`);
      expect(unit.getBoundingClientRect().left).toBeCloseTo(labelBounds.at(-1)!.right, 1);
      expect(labels.getBoundingClientRect().bottom).toBeLessThan(bounds.top);
    }
  );

  it("updates the label and width when the view resolution changes (moveend)", async () => {
    await renderScaleBar();
    const width1 = scaleGraphic().style.width;

    flushSync(() => {
      map.getView().setResolution(600); // very zoomed out → km label
      map.dispatchEvent("moveend");
    });

    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 50 km");
    expect(parseFloat(scaleGraphic().style.width)).toBeCloseTo(50000 / 600);
    expect(scaleGraphic().style.width).not.toBe(width1);
  });

  it("uses fewer segments when longer labels need more room at low zoom", async () => {
    map.getView().setResolution(12360);
    await renderScaleBar();
    const label = new Intl.NumberFormat().format(1000);
    expect(scaleGraphic().getAttribute("aria-label")).toBe(`Map scale ${label} km`);
    expect(scaleGraphic().children[1].children).toHaveLength(2);
    expect(parseFloat(scaleGraphic().style.width)).toBeCloseTo(1000000 / 12360);
  });

  it("accounts for both the mission radius and Mercator distortion", async () => {
    map.getView().setCenter(fromLonLat([0, 60]));
    await renderScaleBar(1737400);

    expect(scaleGraphic().getAttribute("aria-label")).toBe("Map scale 200 m");
    expect(parseFloat(scaleGraphic().style.width)).toBeCloseTo(200 / ((5 * 1737400) / 6378137));
  });

  it("shows the grid interval in its own box above the scale bar", async () => {
    map.set(GRID_INTERVAL_PROPERTY, 100);
    const renderOverlays = (showScaleBar: boolean) => {
      harness.render(
        <MapContext.Provider value={{ map, mode: "editor", planetRadius: 6378137 }}>
          <MapDistanceOverlays showScaleBar={showScaleBar} />
        </MapContext.Provider>
      );
    };
    renderOverlays(true);
    await expect.poll(() => scaleGraphic()?.getAttribute("aria-label")).toMatch(/^Map scale /);
    const bar = scaleGraphic();
    const intervalRow = bar.previousElementSibling!;
    const readout = bar.parentElement!;
    const scaleWidth = bar.getBoundingClientRect().width;
    const intervalBounds = intervalRow.getBoundingClientRect();
    expect(intervalRow.textContent).toBe("Grid 100 m");
    expect(readout.children).toHaveLength(2);
    expect(getComputedStyle(intervalRow).backgroundColor).toBe("rgb(66, 70, 83)");
    expect(getComputedStyle(readout).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(readout).pointerEvents).toBe("none");
    expect(intervalBounds.bottom).toBeLessThan(bar.getBoundingClientRect().top);

    flushSync(() => {
      map.getView().setResolution(12.5);
      map.dispatchEvent("moveend");
    });
    expect(bar.getBoundingClientRect().width).toBeLessThan(scaleWidth);
    expect(intervalRow.getBoundingClientRect().width).toBe(intervalBounds.width);
    expect(intervalRow.textContent).toBe("Grid 100 m");

    flushSync(() => map.set(GRID_INTERVAL_PROPERTY, null));
    expect(readout.children).toHaveLength(1);
    expect(readout.firstElementChild).toBe(bar);

    flushSync(() => map.set(GRID_INTERVAL_PROPERTY, "lgrs-zones"));
    renderOverlays(false);
    expect(scaleGraphic()).toBeNull();
    expect(readout.textContent).toBe("LGRS zones");
    flushSync(() => map.set(GRID_INTERVAL_PROPERTY, null));
    expect(readout.children).toHaveLength(0);
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
