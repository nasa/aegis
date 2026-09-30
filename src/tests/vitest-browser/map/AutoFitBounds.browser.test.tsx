/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `AutoFitBounds`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map wrapped in a
 * `<DashboardBoundsProvider>`. Verifies the minimap fits its view to the
 * mission's running EVA stations + traverses + latest POS entries, and
 * conditionally re-fits when the dashboard bounds box leaves the minimap.
 *
 * Mocks:
 *  - `useCoordConverters` (avoids Automerge dependency)
 *  - `utils/useDocSelector` — provides `planetRadius`
 *
 * Verifies:
 *  - Does nothing in editor or dashboard mode
 *  - In minimap mode, fits the view to running-EVA stations
 *  - Doesn't fit when there are no mission objects
 *  - Refits when the bounds box falls outside the current view
 *  - Does not refit when the bounds box is fully inside the current view
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";

import { MapContext } from "components/interface/map/MapProvider";
import {
  DashboardBoundsProvider,
  useDashboardBoundsContext,
} from "components/interface/map/DashboardBoundsProvider";
import { AutoFitBounds } from "components/interface/map/behaviors/AutoFitBounds";
import { stationSlice } from "store/station";
import { traverseSlice } from "store/traverse";
import { rexSlice } from "store/rex";
import { evaSlice } from "store/eva";
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

const mockMissionDoc: Partial<Mission> & { planetRadius: number | null } = {
  planetRadius: 1737400, // Moon
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATION_A = "station-afb-a";
const STATION_B = "station-afb-b";
const EVA_UUID = "eva-afb-1";
const REX_UUID = "rex-afb-1";

function makeStation(uuid: string, lat: number, lng: number): Station {
  return {
    uuid,
    name: "S",
    icon: "1f535",
    location: { lat, lng },
    mapCircleControls: {},
    updatedAt: new Date().toISOString(),
  } as unknown as Station;
}

function makeRunningRex(uuid: string, evaUuid: string): Rex {
  return {
    uuid,
    evaUuid,
    isRunning: true,
    posEntries: [],
    posTypes: [],
    posSources: [],
  } as unknown as Rex;
}

function makeEva(uuid: string, stationUuids: string[]): Eva {
  return {
    uuid,
    name: "E",
    traverseColor: "#abc",
    sequence: stationUuids.map((u) => ({ uuid: u, type: "station" })),
    updatedAt: new Date().toISOString(),
  } as unknown as Eva;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      station: stationSlice.reducer,
      traverse: traverseSlice.reducer,
      rex: rexSlice.reducer,
      eva: evaSlice.reducer,
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
let captureSetter: ((extent: number[]) => void) | null = null;

function CaptureSetter(): null {
  captureSetter = useDashboardBoundsContext().setBigMapExtent;
  return null;
}

function renderAutoFitBounds(mode: "editor" | "dashboard" | "minimap" = "minimap") {
  harness.render(
    <Provider store={store}>
      <DashboardBoundsProvider>
        <CaptureSetter />
        <MapContext.Provider value={{ map, mode }}>
          <AutoFitBounds />
        </MapContext.Provider>
      </DashboardBoundsProvider>
    </Provider>
  );
}

beforeEach(() => {
  mockMissionDoc.planetRadius = 1737400;
  mockMissionDoc.rexes = undefined;
  mockMissionDoc.evas = undefined;
  mockMissionDoc.stations = undefined;
  mockMissionDoc.traverses = undefined;
  captureSetter = null;
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
  // Force layout so map.getSize() returns a valid size
  map.updateSize();
  map.renderSync();
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

describe("AutoFitBounds", () => {
  it.each(["editor", "dashboard"] as const)(
    "does nothing in %s mode (early-return for non-minimap)",
    (mode) => {
      const stationA = makeStation(STATION_A, 10, 20);
      const eva = makeEva(EVA_UUID, [STATION_A]);
      const rex = makeRunningRex(REX_UUID, EVA_UUID);
      mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
      mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
      mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];

      store = makeStore();

      const centerBefore = map.getView().getCenter();
      renderAutoFitBounds(mode);
      expect(map.getView().getCenter()).toEqual(centerBefore);
    }
  );

  it("in minimap mode, calls view.fit with the bounding extent of running-EVA stations", () => {
    const stationA = makeStation(STATION_A, 10, 20);
    const stationB = makeStation(STATION_B, 30, 40);
    const eva = makeEva(EVA_UUID, [STATION_A, STATION_B]);
    const rex = makeRunningRex(REX_UUID, EVA_UUID);
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.stations = {
      [STATION_A]: stationA,
      [STATION_B]: stationB,
    } as unknown as Mission["stations"];

    store = makeStore();

    // Spy on view.fit before mounting
    const fitSpy = vi.spyOn(map.getView(), "fit");
    renderAutoFitBounds("minimap");

    expect(fitSpy).toHaveBeenCalled();
    const [extent] = fitSpy.mock.calls[0];
    // station A (lat 10, lng 20) → [20000, 10000]
    // station B (lat 30, lng 40) → [40000, 30000]
    // bounding extent = [20000, 10000, 40000, 30000]
    expect(extent).toEqual([20000, 10000, 40000, 30000]);
  });

  it("does not refit on a re-render when the mission extent is unchanged", () => {
    // Reproduces the minimap zoom-jitter bug: the deepEqual doc selectors return
    // the whole station/traverse collection, so editing an unrelated station
    // yields a fresh — but content-identical — missionPoints array. That must NOT
    // trigger another view.fit. (The mocked selector returns a new Object.values
    // array on every render, so a plain re-render exercises exactly this path.)
    const stationA = makeStation(STATION_A, 10, 20);
    const stationB = makeStation(STATION_B, 30, 40);
    const eva = makeEva(EVA_UUID, [STATION_A, STATION_B]);
    const rex = makeRunningRex(REX_UUID, EVA_UUID);
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.stations = {
      [STATION_A]: stationA,
      [STATION_B]: stationB,
    } as unknown as Mission["stations"];

    store = makeStore();

    const fitSpy = vi.spyOn(map.getView(), "fit");
    renderAutoFitBounds("minimap");
    const callsAfterMount = fitSpy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThan(0);

    // Re-render with identical mission content (new array references only).
    renderAutoFitBounds("minimap");
    expect(fitSpy.mock.calls.length).toBe(callsAfterMount);
  });

  it("does not fit when there are no mission objects (no running rex)", () => {
    store = makeStore();
    const centerBefore = map.getView().getCenter();
    const resBefore = map.getView().getResolution();
    renderAutoFitBounds("minimap");
    expect(map.getView().getCenter()).toEqual(centerBefore);
    expect(map.getView().getResolution()).toBe(resBefore);
  });

  it("refits via view.fit when bigMapExtent falls outside the minimap view", () => {
    const stationA = makeStation(STATION_A, 0, 0);
    const eva = makeEva(EVA_UUID, [STATION_A]);
    const rex = makeRunningRex(REX_UUID, EVA_UUID);
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.stations = { [STATION_A]: stationA } as unknown as Mission["stations"];

    store = makeStore();

    const fitSpy = vi.spyOn(map.getView(), "fit");
    renderAutoFitBounds("minimap");
    const callsAfterMount = fitSpy.mock.calls.length;

    // Publish a bounds box that's far outside the current minimap view
    flushSync(() => captureSetter!([1_000_000, 1_000_000, 1_100_000, 1_100_000]));

    // Should trigger another fit() call to bring the bounds box into view
    expect(fitSpy.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it("does NOT refit when bigMapExtent is fully inside the current view", () => {
    // No stations / no running rex → no mission-points fit on mount.
    // We manually position the view so containment is deterministic.
    store = makeStore();

    // Set view to a known wide extent: center [50000, 50000], resolution
    // big enough that a 300×300 viewport covers ~[ -100k, -100k, 200k, 200k ].
    map.getView().setCenter([50000, 50000]);
    map.getView().setResolution(1000);
    map.renderSync();

    const fitSpy = vi.spyOn(map.getView(), "fit");

    renderAutoFitBounds("minimap");
    expect(fitSpy).not.toHaveBeenCalled();

    // Publish a bounds box well inside the viewport
    flushSync(() => captureSetter!([10000, 10000, 90000, 90000]));

    // The box is inside the view → no fit() call should happen
    expect(fitSpy).not.toHaveBeenCalled();
  });
});
