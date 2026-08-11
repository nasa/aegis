/**
 * Browser-mode tests for `MouseCoordinateDisplay`.
 *
 * Mocks:
 *  - `useCoordConverters` — converts projected coords back to lat/lng
 *  - `utils/useDocSelector` — provides planetRadius + usingLGRSCoordinates
 *  - `utils/mapping/geoMath` — stubs getGridCoordinatesFromPoint
 *  - `useServerFileGrid` — provides no server-file grid
 *
 * Verifies:
 *  - Returns null in minimap mode (showMouseCoords=false)
 *  - Returns null in dashboard mode (showMouseCoords=false)
 *  - Renders container element in editor mode (showMouseCoords=true)
 *  - Shows lat/lng text after a pointermove event
 *  - Shows grid coordinate text when getGridCoordinatesFromPoint returns a value
 *  - Skips grid coordinate when getGridCoordinatesFromPoint returns null
 *  - Removes pointermove listener on unmount (no leak)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Map from "ol/Map";
import View from "ol/View";
import OLEvent from "ol/events/Event";

import { MapContext } from "components/interface/map/MapProvider";
import { MouseCoordinateDisplay } from "components/interface/map/overlays/MouseCoordinateDisplay";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

const mockMissionDoc: { planetRadius: number; usingLGRSCoordinates: boolean } = {
  planetRadius: 1737400,
  usingLGRSCoordinates: false,
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc),
  useDocSelector: (): undefined => undefined,
}));

let mockGridCoordResult: string | null = null;

vi.mock("utils/mapping/geoMath", () => ({
  getGridCoordinatesFromPoint: (): string | null => mockGridCoordResult,
  findClosestPointInGlobalGrid: (): null => null,
  adjustGridIndex: (
    _: unknown,
    numRows: number,
    numCols: number
  ): { row: number; col: number } => ({
    row: numRows - 1,
    col: numCols - 1,
  }),
  getTotalDistance: (): number => 0,
  getBearingFromLatLngPoints: (): number => 0,
}));

vi.mock("components/interface/map/hooks/useServerFileGrid", () => ({
  useServerFileGrid: (): MissionGrid | null => null,
}));

// ---------------------------------------------------------------------------
// Harness state
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;

function renderMouseCoordinateDisplay(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <MapContext.Provider value={{ map, mode }}>
      <MouseCoordinateDisplay />
    </MapContext.Provider>
  );
}

beforeEach(() => {
  mockGridCoordResult = null;
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MouseCoordinateDisplay", () => {
  it.each(["minimap", "dashboard"] as const)(
    "renders nothing in %s mode (showMouseCoords=false)",
    (mode) => {
      renderMouseCoordinateDisplay(mode);
      // Component returns null — harness container should be empty
      expect(harness.container.firstChild).toBeNull();
    }
  );

  it("shows lat/lng text after pointermove fires coordinates", async () => {
    renderMouseCoordinateDisplay("editor");

    // Dispatch via the OL map's internal event system
    // toAegisPoint([20000, 10000]) → { lat: 10, lng: 20 }
    map.dispatchEvent(Object.assign(new OLEvent("pointermove"), { coordinate: [20000, 10000] }));

    await vi.waitFor(() => {
      const text = document.body.textContent ?? "";
      expect(text).toMatch(/10\.0+/); // lat
      expect(text).toMatch(/20\.0+/); // lng
    });
  });

  it("shows grid coordinate when getGridCoordinatesFromPoint returns a value", async () => {
    mockGridCoordResult = "A-3";
    renderMouseCoordinateDisplay("editor");

    map.dispatchEvent(Object.assign(new OLEvent("pointermove"), { coordinate: [5000, 8000] }));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("A-3");
    });
  });

  it("does not show grid coordinate when getGridCoordinatesFromPoint returns null", async () => {
    mockGridCoordResult = null;
    renderMouseCoordinateDisplay("editor");

    map.dispatchEvent(Object.assign(new OLEvent("pointermove"), { coordinate: [5000, 8000] }));

    await vi.waitFor(() => {
      const text = document.body.textContent ?? "";
      // lat/lng div should appear
      expect(text).toMatch(/5\.0+/);
    });

    // Grid text should not appear
    expect(document.body.textContent).not.toContain("A-");
  });

  it("removes pointermove listener on unmount (no leak)", () => {
    const unSpy = vi.spyOn(map, "un");
    renderMouseCoordinateDisplay("editor");

    harness.unmount();
    harness = createReactHarness();

    const unCalls = unSpy.mock.calls.filter((c) => (c[0] as unknown as string) === "pointermove");
    expect(unCalls.length).toBeGreaterThanOrEqual(1);
  });
});
