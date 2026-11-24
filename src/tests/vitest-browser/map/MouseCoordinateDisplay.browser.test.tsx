/**
 * Browser-mode tests for `MouseCoordinateDisplay`.
 *
 * Mocks:
 *  - `utils/useDocSelector` — provides projection, planet, serverFileGrid and label scheme
 *  - `utils/mapping/geoMath` — stubs getGridCoordinatesFromPoint (server-file grid path)
 *  - `useResolvedMissionGrid` — provides the resolved grid kind
 *
 * Verifies:
 *  - Returns null in minimap and dashboard mode (showMouseCoords=false)
 *  - Shows lat/lng identical to proj4 after a pointermove event
 *  - Shows whole-Moon LGRS strings (LTM, LPS N, LPS S; condensed and full)
 *  - Shows / skips the server-file grid coordinate
 *  - Shows Earth ACC and MGRS strings at JSC and LGRS on the Moon, with explanatory indicators
 *  - Reformats the last position, string and tag together, when the mission scheme changes
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
  planet: "mars" as Planet,
  serverFileGrid: null as MissionGridDefinition | null,
  earthGridLabelScheme: undefined as GridLabelScheme | undefined,
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
  mockMissionDoc.projIsCustom = true;
  mockMissionDoc.projEpsg = projEpsg;
  mockMissionDoc.projProj4String = projProj4String;
}

/** An Earth mission on the default Web Mercator map. */
function setEarthMission(scheme: GridLabelScheme | undefined) {
  mockMissionDoc.projIsCustom = false;
  mockMissionDoc.projEpsg = "EPSG:3857";
  mockMissionDoc.projProj4String = "";
  mockMissionDoc.planet = "earth";
  mockMissionDoc.earthGridLabelScheme = scheme;
}

/** Map coordinate of a lat/lng in the mocked mission projection. */
function toMap(lat: number, lng: number): number[] {
  const projection = mockMissionDoc.projIsCustom ? mockMissionDoc.projProj4String : "EPSG:3857";
  return proj4(projection, "EPSG:4326").inverse([lng, lat]);
}

function pointerMove(coordinate: number[]) {
  map.dispatchEvent(Object.assign(new OLEvent("pointermove"), { coordinate }));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

beforeEach(() => {
  mockMissionDoc.serverFileGrid = null;
  mockGridCoordResult = null;
  mockResolvedGrid = { kind: "none" };
  mockMissionDoc.planet = "mars";
  mockMissionDoc.earthGridLabelScheme = undefined;
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
    mockMissionDoc.planet = "moon";
    mockResolvedGrid = dynamic ? { kind: "dynamic-lgrs" } : { kind: "none" };
    renderMouseCoordinateDisplay("editor");

    pointerMove(toMap(lat, lng));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain(expected);
      expect(document.querySelector("[data-testid='mouse-grid-scheme']")?.textContent).toBe("LGRS");
    });
  });

  // JSC (29.5593, −95.0900), plan §3.4.
  it.each([
    { scheme: undefined, tag: "ACC", text: "15RTNDC X51 W77", dynamic: true },
    { scheme: "mgrs", tag: "MGRS", text: "15R TN 9751 7177", dynamic: true },
    { scheme: "lunar-acc", tag: "ACC", text: "X51 W77", dynamic: false },
    { scheme: "mgrs", tag: "MGRS", text: "TN 9751 7177", dynamic: false },
  ] as const)(
    "shows $text [$tag] at JSC with mission scheme $scheme",
    async ({ scheme, tag, text, dynamic }) => {
      setEarthMission(scheme);
      mockResolvedGrid = dynamic ? { kind: "dynamic-lgrs" } : { kind: "none" };
      renderMouseCoordinateDisplay("editor");

      pointerMove(toMap(29.5593, -95.09));

      await vi.waitFor(() => {
        const tagElement = document.querySelector("[data-testid='mouse-grid-scheme']");
        expect(tagElement?.textContent).toBe(tag);
        expect(tagElement?.parentElement?.textContent).toBe(`${text}${tag}`);
      });
    }
  );

  it("relabels the last position when the scheme switches, before the pointer moves", async () => {
    setEarthMission("lunar-acc");
    mockResolvedGrid = { kind: "dynamic-lgrs" };
    renderMouseCoordinateDisplay("editor");
    pointerMove(toMap(29.5593, -95.09));
    const readout = () =>
      document.querySelector("[data-testid='mouse-grid-scheme']")?.parentElement?.textContent;
    await vi.waitFor(() => expect(readout()).toBe("15RTNDC X51 W77ACC"));

    mockMissionDoc.earthGridLabelScheme = "mgrs";
    renderMouseCoordinateDisplay("editor");

    await vi.waitFor(() => expect(readout()).toBe("15R TN 9751 7177MGRS"));
  });

  it("shows no scheme for Mars", async () => {
    mockMissionDoc.planet = "mars";
    renderMouseCoordinateDisplay();
    pointerMove(toMap(0, 0));
    await nextFrame();
    expect(harness.container.querySelector("[data-testid='mouse-grid-scheme']")).toBeNull();
  });

  it("shows an uploaded Earth grid coordinate with no planetary scheme tag", async () => {
    mockMissionDoc.planet = "earth";
    mockMissionDoc.serverFileGrid = { name: "USGS", fileName: "usgs.json", numRows: 1, numCols: 1 };
    mockGridCoordResult = "A-3";
    mockResolvedGrid = {
      kind: "server-file",
      grid: { coordinates: [] } as unknown as MissionGrid,
    };
    renderMouseCoordinateDisplay("editor");

    pointerMove([5000, 8000]);

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("A-3");
      expect(document.querySelector("[data-testid='mouse-grid-scheme']")).toBeNull();
    });
  });

  it("hides the scheme tag for an uploaded grid", async () => {
    setEarthMission("mgrs");
    mockResolvedGrid = {
      kind: "server-file",
      grid: { coordinates: [] } as unknown as MissionGrid,
    };
    renderMouseCoordinateDisplay("editor");

    pointerMove(toMap(35.574972, -111.704697));

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("35.574972, -111.704697");
    });
    expect(document.querySelector('[data-testid="mouse-grid-scheme"]')).toBeNull();
  });

  it("keeps the lat/lng readout on one line", async () => {
    renderMouseCoordinateDisplay("editor");

    pointerMove(toMap(-35.574972, -111.704697));

    const readout = await vi.waitFor(() => {
      const el = [...document.querySelectorAll("div")].find(
        (d) => d.children.length === 0 && d.textContent === "-35.574972, -111.704697"
      );
      expect(el).toBeDefined();
      return el!;
    });
    // A narrow, shrink-to-fit parent like the bottom-right overlay box.
    readout.parentElement!.style.cssText = "position: absolute; width: 0";

    // Every text fragment sits on the same line.
    const range = document.createRange();
    range.selectNodeContents(readout);
    const lineTops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    expect(lineTops.size).toBe(1);
  });

  it("keeps the readout width as the digits change", async () => {
    setEarthMission("mgrs");
    mockResolvedGrid = { kind: "dynamic-lgrs" };
    renderMouseCoordinateDisplay("editor");
    const container = harness.container.firstElementChild as HTMLElement;
    container.style.cssText = "position: absolute; width: max-content";

    const widthAt = async (lat: number, lng: number, latLng: string) => {
      pointerMove(toMap(lat, lng));
      await vi.waitFor(() => expect(container.firstElementChild?.textContent).toBe(latLng));
      return container.getBoundingClientRect().width;
    };

    const firstWidth = await widthAt(11.111111, -111.111111, "11.111111, -111.111111");
    const secondWidth = await widthAt(48.888888, -108.888888, "48.888888, -108.888888");
    expect(secondWidth).toBe(firstWidth);
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
    mockMissionDoc.planet = "moon";
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
    mockMissionDoc.planet = "moon";
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
