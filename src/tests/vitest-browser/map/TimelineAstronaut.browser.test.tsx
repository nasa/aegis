/**
 * Browser-mode tests for `TimelineAstronaut`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map and a Redux store.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * The component creates an `ol/Overlay` (DOM element) which moves along a
 * traverse or measurement path in response to hover state.
 *
 * Verifies:
 *  - Astronaut overlay added to the map in editor mode only
 *  - Hidden initially (no position)
 *  - Positions to a station when hovering a station sequence item
 *  - Positions along a traverse path using the percent-elapsed
 *  - Positions along a measurement path using percent distance
 *  - Switches text to the X emoji when measurement hover is active
 *  - Removes overlay on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import type Overlay from "ol/Overlay";

import { MapContext } from "components/interface/map/MapProvider";
import { TimelineAstronaut } from "components/interface/map/behaviors/TimelineAstronaut";
import { hoverSlice } from "store/hover";
import { evaSlice } from "store/eva";
import { stationSlice } from "store/station";
import { traverseSlice } from "store/traverse";
import { measureSlice } from "store/measure";
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

// Mutable mock Automerge doc — tests populate evas/traverses/stations here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATION_UUID = "station-ta-1";
const TRAVERSE_UUID = "traverse-ta-1";
const MEASUREMENT_UUID = "meas-ta-1";
const EVA_UUID = "eva-ta-1";

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

function makeTraverse(uuid: string): Traverse {
  return {
    uuid,
    name: "T",
    color: "#abc",
    path: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 100 },
    ],
    updatedAt: new Date().toISOString(),
  } as unknown as Traverse;
}

function makeMeasurement(uuid: string): Measurement {
  return {
    uuid,
    name: "M",
    color: "#fff",
    path: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 200 },
    ],
    updatedAt: new Date().toISOString(),
  } as unknown as Measurement;
}

function makeEva(uuid: string, sequence: { uuid: string; type: string }[]): Eva {
  return {
    uuid,
    name: "E",
    traverseColor: "#abc",
    sequence,
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
      hover: hoverSlice.reducer,
      eva: evaSlice.reducer,
      station: stationSlice.reducer,
      traverse: traverseSlice.reducer,
      measure: measureSlice.reducer,
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

function renderTimelineAstronaut(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <Provider store={store}>
      <MapContext.Provider value={{ map, mode }}>
        <TimelineAstronaut />
      </MapContext.Provider>
    </Provider>
  );
}

/** Find the astronaut overlay (the only overlay this component adds). */
function findAstronautOverlay(): Overlay | null {
  const overlays = map.getOverlays().getArray();
  for (const o of overlays) {
    const el = o.getElement() as HTMLElement | undefined;
    if (el && (el.textContent === "🧑‍🚀" || el.textContent === "❌")) return o;
  }
  return null;
}

beforeEach(() => {
  harness = createReactHarness();

  // Reset mock doc before each test
  Object.keys(mockMissionDoc).forEach((k) => {
    delete (mockMissionDoc as Record<string, unknown>)[k];
  });

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

describe("TimelineAstronaut", () => {
  it("adds an Overlay with astronaut emoji in editor mode", () => {
    store = makeStore();
    renderTimelineAstronaut("editor");

    const overlay = findAstronautOverlay();
    expect(overlay).not.toBeNull();
    const el = overlay!.getElement() as HTMLElement;
    expect(el.textContent).toBe("🧑‍🚀");
  });

  it("does NOT add the overlay in dashboard mode", () => {
    store = makeStore();
    renderTimelineAstronaut("dashboard");
    expect(findAstronautOverlay()).toBeNull();
  });

  it("does NOT add the overlay in minimap mode", () => {
    store = makeStore();
    renderTimelineAstronaut("minimap");
    expect(findAstronautOverlay()).toBeNull();
  });

  it("starts hidden (no position) until hover state is set", () => {
    store = makeStore();
    renderTimelineAstronaut("editor");

    const overlay = findAstronautOverlay()!;
    expect(overlay.getPosition()).toBeUndefined();
  });

  it("positions overlay at a station when hovering a station sequence item", () => {
    const station = makeStation(STATION_UUID, 7, 8);
    const eva = makeEva(EVA_UUID, [{ uuid: STATION_UUID, type: "station" }]);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_UUID,
        mapItemType: "station",
        sequenceItemPercentElapsed: 0.5,
      },
    } as PartialPreloadedState);

    renderTimelineAstronaut("editor");

    const overlay = findAstronautOverlay()!;
    expect(overlay.getPosition()).toEqual([8000, 7000]);
  });

  it("positions overlay along a traverse path using percent elapsed", () => {
    const traverse = makeTraverse(TRAVERSE_UUID);
    const eva = makeEva(EVA_UUID, [{ uuid: TRAVERSE_UUID, type: "traverse" }]);
    mockMissionDoc.traverses = { [TRAVERSE_UUID]: traverse } as unknown as Mission["traverses"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: TRAVERSE_UUID,
        mapItemType: "traverse",
        sequenceItemPercentElapsed: 0.5,
      },
    } as PartialPreloadedState);

    renderTimelineAstronaut("editor");

    const overlay = findAstronautOverlay()!;
    const pos = overlay.getPosition();
    expect(pos).not.toBeUndefined();
    // Path projected: [[0,0], [100000, 0]]; midpoint = [50000, 0]
    expect(pos![0]).toBe(50000);
    expect(pos![1]).toBe(0);
  });

  it("clears position when sequenceItemPercentElapsed is null", () => {
    const station = makeStation(STATION_UUID, 7, 8);
    const eva = makeEva(EVA_UUID, [{ uuid: STATION_UUID, type: "station" }]);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_UUID,
        mapItemType: "station",
        sequenceItemPercentElapsed: 0.5,
      },
    } as PartialPreloadedState);

    renderTimelineAstronaut("editor");
    expect(findAstronautOverlay()!.getPosition()).toBeDefined();

    flushSync(() => {
      store.dispatch(hoverSlice.actions.clearMapItemHover());
    });

    expect(findAstronautOverlay()!.getPosition()).toBeUndefined();
  });

  it("positions overlay along a measurement path with X emoji on measurement hover", () => {
    const meas = makeMeasurement(MEASUREMENT_UUID);

    store = makeStore({
      measure: {
        ...measureSlice.getInitialState(),
        measurements: [meas],
      },
      hover: {
        ...hoverSlice.getInitialState(),
        measurementUuid: MEASUREMENT_UUID,
        measurementPercentDistance: 0.25,
      },
    } as PartialPreloadedState);

    renderTimelineAstronaut("editor");

    const overlay = findAstronautOverlay()!;
    const el = overlay.getElement() as HTMLElement;
    expect(el.textContent).toBe("❌");

    const pos = overlay.getPosition();
    expect(pos).not.toBeUndefined();
    // Path projected: [[0,0], [200000, 0]]; 25% along = [50000, 0]
    expect(pos![0]).toBe(50000);
    expect(pos![1]).toBe(0);
  });

  it("removes the overlay from the map on unmount", () => {
    store = makeStore();
    renderTimelineAstronaut("editor");
    expect(findAstronautOverlay()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findAstronautOverlay()).toBeNull();
  });
});
