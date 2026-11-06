/**
 * Browser-mode tests for `MouseCoordinateDisplay`.
 *
 * Mocks:
 *  - `utils/useDocSelector` — provides projection, planetRadius + usingLGRSCoordinates
 *  - `utils/mapping/geoMath` — stubs getGridCoordinatesFromPoint (server-file grid path)
 *  - `useResolvedMissionGrid` — provides the resolved grid kind
 *
 * Verifies:
 *  - Returns null in minimap and dashboard mode (showMouseCoords=false)
 *  - Shows lat/lng identical to proj4 after a pointermove event
 *  - Shows whole-Moon LGRS strings (LTM, LPS N, LPS S; condensed and full)
 *  - Shows / skips the server-file grid coordinate
 *  - Coalesces pointermoves into one update per animation frame
 *  - Does not re-render for pointermoves that leave the displayed text unchanged
 *  - Removes the pointermove listener and cancels the pending frame on unmount
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Profiler } from "react";
import Map from "ol/Map";
import View from "ol/View";
import OLEvent from "ol/events/Event";
import proj4 from "proj4";

import { MapContext } from "components/interface/map/MapProvider";
import { MouseCoordinateDisplay } from "components/interface/map/overlays/MouseCoordinateDisplay";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const MOON = "+a=1737400 +b=1737400 +units=m +no_defs";
const MOON_EQC = `+proj=eqc +lat_ts=0 +lat_0=0 +lon_0=0 +x_0=0 +y_0=0 ${MOON}`;
const SOUTH_CAP = `+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 ${MOON}`;

const mockMissionDoc = {
  id: 1,
  projIsCustom: true,
  projEpsg: "TEST:MOON-EQC",
  projProj4String: MOON_EQC,
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
}));

let mockResolvedGrid: ResolvedMissionGrid = { kind: "none" };

vi.mock("components/interface/map/hooks/useResolvedMissionGrid", () => ({
  useResolvedMissionGrid: (): ResolvedMissionGrid => mockResolvedGrid,
}));

// ---------------------------------------------------------------------------
// Harness state
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let renderCount = 0;

function renderMouseCoordinateDisplay(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <MapContext.Provider value={{ map, mode }}>
      <Profiler id="mouse" onRender={() => renderCount++}>
        <MouseCoordinateDisplay />
      </Profiler>
    </MapContext.Provider>
  );
}

function setMockProjection(projEpsg: string, projProj4String: string) {
  mockMissionDoc.projEpsg = projEpsg;
  mockMissionDoc.projProj4String = projProj4String;
}

/** Map coordinate of a lat/lng in the mocked mission projection. */
function toMap(lat: number, lng: number): number[] {
  return proj4(mockMissionDoc.projProj4String, "EPSG:4326").inverse([lng, lat]);
}

function pointerMove(coordinate: number[]) {
  map.dispatchEvent(Object.assign(new OLEvent("pointermove"), { coordinate }));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

beforeEach(() => {
  mockGridCoordResult = null;
  mockResolvedGrid = { kind: "none" };
  mockMissionDoc.usingLGRSCoordinates = false;
  setMockProjection("TEST:MOON-EQC", MOON_EQC);
  renderCount = 0;
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
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MouseCoordinateDisplay", () => {
  it.each(["minimap", "dashboard"] as const)(
    "renders nothing in %s mode (showMouseCoords=false)",
    (mode) => {
      renderMouseCoordinateDisplay(mode);
      expect(harness.container.firstChild).toBeNull();
    }
  );

  it("shows the proj4 lat/lng after pointermove fires coordinates", async () => {
    renderMouseCoordinateDisplay("editor");

    const coordinate = [123456.789, -98765.4321];
    const [lng, lat] = proj4(MOON_EQC, "EPSG:4326").forward(coordinate);
    pointerMove(coordinate);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    });
  });

  it.each([
    { name: "LTM", lat: 45, lng: 90, dynamic: false, expected: "S84 N71" },
    { name: "LTM", lat: 45, lng: 90, dynamic: true, expected: "34TGQ S84 N71" },
    { name: "LTM zone 1", lat: 0.5, lng: -179.5, dynamic: true, expected: "1NAA" },
    { name: "LPS N", lat: 80, lng: 10, dynamic: true, expected: "ZCA B47 B40" },
    { name: "LPS S", lat: -89, lng: -133, dynamic: false, expected: "B95 D44", south: true },
    { name: "LPS S", lat: -89, lng: -133, dynamic: true, expected: "AZM B95 D44", south: true },
  ])("shows $expected for $name (dynamic grid: $dynamic)", async (testCase) => {
    const { lat, lng, dynamic, expected, south } = testCase;
    if (south) setMockProjection("TEST:SOUTH-CAP", SOUTH_CAP);
    mockMissionDoc.usingLGRSCoordinates = true;
    mockResolvedGrid = dynamic ? { kind: "dynamic-lgrs" } : { kind: "none" };
    renderMouseCoordinateDisplay("editor");

    pointerMove(toMap(lat, lng));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(expected);
    });
  });

  it("shows the server-file grid coordinate when one is found", async () => {
    mockGridCoordResult = "A-3";
    mockResolvedGrid = {
      kind: "server-file",
      grid: { coordinates: [] } as unknown as MissionGrid,
    };
    renderMouseCoordinateDisplay("editor");

    pointerMove([5000, 8000]);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("A-3");
    });
  });

  it("does not show a grid coordinate without LGRS or a grid", async () => {
    mockGridCoordResult = "A-3";
    renderMouseCoordinateDisplay("editor");

    pointerMove(toMap(5, 8));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("5.000000, 8.000000");
    });
    expect(document.body.textContent).not.toContain("A-3");
  });

  it("coalesces pointermoves into one update per animation frame", async () => {
    mockMissionDoc.usingLGRSCoordinates = true;
    renderMouseCoordinateDisplay("editor");
    const rendersBefore = renderCount;

    pointerMove(toMap(1, 1));
    pointerMove(toMap(2, 2));
    pointerMove(toMap(45, 90));
    await nextFrame();
    await nextFrame();

    expect(document.body.textContent).toContain("45.000000, 90.000000");
    expect(document.body.textContent).toContain("S84 N71");
    expect(renderCount - rendersBefore).toBe(1);
  });

  it("does not re-render when the displayed text is unchanged", async () => {
    mockMissionDoc.usingLGRSCoordinates = true;
    renderMouseCoordinateDisplay("editor");

    const coordinate = toMap(45, 90);
    pointerMove(coordinate);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("S84 N71");
    });
    const rendersAfterFirstMove = renderCount;

    // Same coordinate, then a sub-millimetre move: same lat/lng text and 10 m label.
    pointerMove(coordinate);
    await nextFrame();
    pointerMove([coordinate[0] + 0.0001, coordinate[1] - 0.0001]);
    await nextFrame();
    await nextFrame();

    expect(renderCount).toBe(rendersAfterFirstMove);
  });

  it("removes the pointermove listener and cancels the pending frame on unmount", () => {
    const unSpy = vi.spyOn(map, "un");
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    renderMouseCoordinateDisplay("editor");

    pointerMove([5000, 8000]);
    harness.unmount();
    harness = createReactHarness();

    const unCalls = unSpy.mock.calls.filter((c) => (c[0] as unknown as string) === "pointermove");
    expect(unCalls.length).toBeGreaterThanOrEqual(1);
    expect(cancelSpy).toHaveBeenCalled();
  });
});
