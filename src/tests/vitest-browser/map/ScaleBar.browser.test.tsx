/**
 * Browser-mode tests for `ScaleBar`.
 *
 * Mounts the ScaleBar against a hand-rolled OL Map (via MapContext directly,
 * bypassing the full MapProvider which needs an Automerge mission doc). The
 * scale bar reads `view.getResolution()` and writes label/width into DOM.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import { MapContext } from "components/interface/map/MapProvider";
import { ScaleBar } from "components/interface/map/overlays/ScaleBar";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;

/** Render the ScaleBar and wait for the post-mount effect to flush
 *  (effect calls setScale → triggers a re-render that emits the DOM). */
async function renderScaleBar(): Promise<HTMLDivElement | null> {
  harness.render(
    <MapContext.Provider value={{ map, mode: "editor" }}>
      <ScaleBar className="scaleBarTest" />
    </MapContext.Provider>
  );
  await new Promise((r) => setTimeout(r, 0));
  // Re-render to drain any pending state updates from the effect
  harness.render(
    <MapContext.Provider value={{ map, mode: "editor" }}>
      <ScaleBar className="scaleBarTest" />
    </MapContext.Provider>
  );
  return harness.container.querySelector<HTMLDivElement>(".scaleBarTest");
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
    const label = el!.querySelector("div")!.textContent ?? "";
    expect(label).toMatch(/\d+\s*(m|km)$/);
    const width = parseFloat((el as HTMLDivElement).style.width);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(200); // bar is sized around 100 px target
  });

  it("uses 'm' unit when the rounded distance is < 1000 m", async () => {
    map.getView().setResolution(2); // 2 m/px → 200m target → label in m
    const el = await renderScaleBar();
    expect(el!.querySelector("div")!.textContent).toMatch(/^\d+\s*m$/);
  });

  it("uses 'km' unit when the rounded distance is >= 1000 m", async () => {
    map.getView().setResolution(50); // 50 m/px * 100 = 5000 m → km
    const el = await renderScaleBar();
    expect(el!.querySelector("div")!.textContent).toMatch(/\d+\s*km$/);
  });

  it("updates the label and width when the view resolution changes (moveend)", async () => {
    const el1 = await renderScaleBar();
    const label1 = el1!.querySelector("div")!.textContent;

    flushSync(() => {
      map.getView().setResolution(500); // very zoomed out → km label
      map.dispatchEvent("moveend");
    });

    const el2 = harness.container.querySelector(".scaleBarTest")!;
    const label2 = el2.querySelector("div")!.textContent;
    expect(label2).not.toBe(label1);
    expect(label2).toMatch(/\d+\s*km$/);
  });

  it("rounds resolutions to 'nice' values (1, 2, 5, 10, ...)", async () => {
    // 7 m/px * 100 = 700m raw → roundToNice picks 1000 → '1 km'
    map.getView().setResolution(7);
    const el = await renderScaleBar();
    expect(el!.querySelector("div")!.textContent).toMatch(/^1\s*km$/);
  });

  it("removes its moveend listener on unmount (no leak)", async () => {
    const unSpy = vi.spyOn(map, "un");
    await renderScaleBar();

    flushSync(() => harness.root.unmount());

    const unCalls = unSpy.mock.calls.filter((c) => (c[0] as unknown as string) === "moveend");
    expect(unCalls.length).toBeGreaterThanOrEqual(1);
  });
});
