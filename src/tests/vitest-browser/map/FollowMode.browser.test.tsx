/* eslint-disable react-hooks/globals */
/**
 * Browser-mode tests for `FollowMode`.
 *
 * Mocks:
 *  - `useCoordConverters` — avoids Automerge dependency
 *  - `utils/useDocSelector` — provides mutable planetRadius + landerLocation
 *
 * Verifies:
 *  - Does nothing in editor mode (no view.fit called)
 *  - Does nothing in minimap mode
 *  - In dashboard mode: publishes viewport extent to DashboardBoundsProvider on mount
 *  - In dashboard mode: publishes updated extent on moveend
 *  - In dashboard mode with no running REX: view is not fitted
 *  - In dashboard mode with running EVA stations: view.fit is called
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushSync } from "react-dom";
import { Provider } from "react-redux";
import { CookiesProvider, Cookies } from "react-cookie";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";

import { MapContext } from "components/interface/map/MapProvider";
import {
  DashboardBoundsProvider,
  useDashboardBoundsContext,
} from "components/interface/map/DashboardBoundsProvider";
import { FollowMode } from "components/interface/map/behaviors/FollowMode";
import { FollowModeProvider } from "components/interface/map/FollowModeProvider";
import {
  MapMenuProvider,
  useMapMenuSetters,
  type MapMenuSetters,
} from "components/interface/map/MapMenuProvider";
import { stationSlice } from "store/station";
import { traverseSlice } from "store/traverse";
import { rexSlice } from "store/rex";
import { evaSlice } from "store/eva";
import { actionSlice } from "store/action";
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

const mockMissionDoc: Partial<Mission> & {
  planetRadius: number;
  landerLocation: AEGISPoint | null;
} = {
  planetRadius: 1737400,
  landerLocation: null,
};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATION_A_UUID = "station-fm-a";
const EVA_UUID = "eva-fm-1";
const REX_UUID = "rex-fm-1";

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

function makeEva(uuid: string, stationUuids: string[]): Eva {
  return {
    uuid,
    name: "EVA 1",
    traverseColor: "#ff0000",
    sequence: stationUuids.map((u) => ({ uuid: u, type: "station" })),
    updatedAt: new Date().toISOString(),
  } as unknown as Eva;
}

function makeRunningRex(
  uuid: string,
  evaUuid: string,
  stationEntries: ActivityEntries = {},
  overrides: Partial<Rex> = {}
): Rex {
  return {
    uuid,
    evaUuid,
    isRunning: true,
    posEntries: [],
    posTypes: [],
    posSources: [],
    stationEntries,
    traverseEntries: {},
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as unknown as Rex;
}

const POSTYPE_EV1_UUID = "postype-ev1";
const SOURCE_A_UUID = "source-a";
const SOURCE_B_UUID = "source-b";

function makePosType(uuid: string, name: string): PosType {
  return { uuid, name, abbr: name, pathColor: "#00aaff" } as unknown as PosType;
}

function makePosSource(uuid: string, abbr: string): PosSource {
  return { uuid, name: abbr, abbr } as unknown as PosSource;
}

function makePosEntry(
  uuid: string,
  lat: number,
  lng: number,
  posTypeUuids: string[],
  posSourceUuid: string,
  createdAt: string
): PosEntry {
  return {
    uuid,
    location: { lat, lng },
    elevation: null,
    petSeconds: 0,
    posTypeUuids,
    posSourceUuid,
    createdAt,
    updatedAt: createdAt,
  } as unknown as PosEntry;
}

// Full MapSubmenuPos with overrides — mirrors the eyeball-menu defaults.
function makeMapDisplayPos(overrides: Partial<MapSubmenuPos> = {}): MapSubmenuPos {
  return {
    show: true,
    showAllLabels: false,
    showLatestLabels: true,
    showPaths: true,
    showOldPaths: true,
    fadeOldPaths: true,
    showMarkers: true,
    showOldMarkers: true,
    fadeOldMarkers: true,
    sourceUuids: [],
    ...overrides,
  };
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
      action: actionSlice.reducer,
    },
    preloadedState,
  });
}

// ---------------------------------------------------------------------------
// Harness state
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;
let capturedExtent: number[] | null = null;
let capturedSetters: MapMenuSetters | null = null;
let testCookies: Cookies;

function ExtentCapture(): null {
  capturedExtent = useDashboardBoundsContext().bigMapExtent;
  return null;
}

function SettersCapture(): null {
  capturedSetters = useMapMenuSetters();
  return null;
}

function renderFollowMode(mode: "editor" | "dashboard" | "minimap" = "dashboard") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <DashboardBoundsProvider>
          <ExtentCapture />
          <MapContext.Provider value={{ map, mode }}>
            <MapMenuProvider>
              <SettersCapture />
              <FollowModeProvider>
                <FollowMode />
              </FollowModeProvider>
            </MapMenuProvider>
          </MapContext.Provider>
        </DashboardBoundsProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  mockMissionDoc.planetRadius = 1737400;
  mockMissionDoc.landerLocation = null;
  mockMissionDoc.rexes = undefined;
  mockMissionDoc.evas = undefined;
  mockMissionDoc.stations = undefined;
  capturedExtent = null;
  capturedSetters = null;
  testCookies = new Cookies();
  harness = createReactHarness();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    interactions: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });
  map.updateSize();

  store = makeStore();
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

describe("FollowMode", () => {
  it.each(["editor", "minimap"] as const)("does not publish bigMapExtent in %s mode", (mode) => {
    renderFollowMode(mode);
    expect(capturedExtent).toBeNull();
  });

  it("publishes bigMapExtent immediately on mount in dashboard mode", async () => {
    map.updateSize();
    renderFollowMode("dashboard");
    // FollowMode calls setBigMapExtent on mount via a useEffect;
    // the subsequent React state update + re-render is async, so poll.
    await vi.waitFor(() => {
      expect(capturedExtent).not.toBeNull();
      expect(capturedExtent!.length).toBe(4);
    });
  });

  it("does not call view.fit when there is no running REX", () => {
    const fitSpy = vi.spyOn(map.getView(), "fit");

    store = makeStore({
      rex: { ...rexSlice.getInitialState(), rexes: [] },
    } as PartialPreloadedState);

    renderFollowMode("dashboard");
    expect(fitSpy).not.toHaveBeenCalled();
  });

  it("calls view.fit when a running EVA station is in-progress", () => {
    const fitSpy = vi.spyOn(map.getView(), "fit");

    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    const rex = makeRunningRex(REX_UUID, EVA_UUID, {
      [STATION_A_UUID]: { rexStatus: "in-progress" },
    });
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore();

    renderFollowMode("dashboard");
    expect(fitSpy).toHaveBeenCalled();
  });

  it("does not call view.fit when a running EVA station is not in-progress", () => {
    const fitSpy = vi.spyOn(map.getView(), "fit");

    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    // Station is part of the running EVA but only pending — not yet started.
    const rex = makeRunningRex(REX_UUID, EVA_UUID, {
      [STATION_A_UUID]: { rexStatus: "pending" },
    });
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore();

    renderFollowMode("dashboard");
    expect(fitSpy).not.toHaveBeenCalled();
  });

  it("follows a running crew position whose source is visible", async () => {
    const fitSpy = vi.spyOn(map.getView(), "fit");

    const eva = makeEva(EVA_UUID, []);
    const entry = makePosEntry(
      "p1",
      10,
      20,
      [POSTYPE_EV1_UUID],
      SOURCE_B_UUID,
      "2026-01-01T00:00:00Z"
    );
    const rex = makeRunningRex(
      REX_UUID,
      EVA_UUID,
      {},
      {
        posEntries: [entry],
        posTypes: [makePosType(POSTYPE_EV1_UUID, "EV1")],
        posSources: [makePosSource(SOURCE_A_UUID, "A"), makePosSource(SOURCE_B_UUID, "B")],
      }
    );
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore();

    // Default eyeball menu shows all sources → the crew position is followed.
    // The EV1 follow flag is set by FollowModeProvider's mount effect, so the
    // fit fires after that async state update settles.
    renderFollowMode("dashboard");
    await vi.waitFor(() => {
      expect(fitSpy).toHaveBeenCalled();
    });
  });

  it("does not follow a crew position from a source hidden in the eyeball menu", async () => {
    const fitSpy = vi.spyOn(map.getView(), "fit");

    const eva = makeEva(EVA_UUID, []);
    const entry = makePosEntry(
      "p1",
      10,
      20,
      [POSTYPE_EV1_UUID],
      SOURCE_B_UUID,
      "2026-01-01T00:00:00Z"
    );
    const rex = makeRunningRex(
      REX_UUID,
      EVA_UUID,
      {},
      {
        posEntries: [entry],
        posTypes: [makePosType(POSTYPE_EV1_UUID, "EV1")],
        posSources: [makePosSource(SOURCE_A_UUID, "A"), makePosSource(SOURCE_B_UUID, "B")],
      }
    );
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore();
    renderFollowMode("dashboard");

    // Confirm the crew position is followed with all sources visible.
    await vi.waitFor(() => {
      expect(fitSpy).toHaveBeenCalled();
    });

    // Restrict to source A only — the entry is from source B, so it should no
    // longer be followed.
    fitSpy.mockClear();
    flushSync(() => {
      capturedSetters!.setSubmenuPos(makeMapDisplayPos({ sourceUuids: [SOURCE_A_UUID] }));
    });
    expect(fitSpy).not.toHaveBeenCalled();
  });

  it("does not follow crew positions when positions are hidden in the eyeball menu", async () => {
    const fitSpy = vi.spyOn(map.getView(), "fit");

    const eva = makeEva(EVA_UUID, []);
    const entry = makePosEntry(
      "p1",
      10,
      20,
      [POSTYPE_EV1_UUID],
      SOURCE_A_UUID,
      "2026-01-01T00:00:00Z"
    );
    const rex = makeRunningRex(
      REX_UUID,
      EVA_UUID,
      {},
      {
        posEntries: [entry],
        posTypes: [makePosType(POSTYPE_EV1_UUID, "EV1")],
        posSources: [makePosSource(SOURCE_A_UUID, "A")],
      }
    );
    mockMissionDoc.rexes = { [REX_UUID]: rex } as unknown as Mission["rexes"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore();
    renderFollowMode("dashboard");

    // Confirm the crew position is followed while positions are visible.
    await vi.waitFor(() => {
      expect(fitSpy).toHaveBeenCalled();
    });

    // Turn the whole Positions layer off → nothing to follow.
    fitSpy.mockClear();
    flushSync(() => {
      capturedSetters!.setSubmenuPos(makeMapDisplayPos({ show: false }));
    });
    expect(fitSpy).not.toHaveBeenCalled();
  });

  it("updates bigMapExtent on moveend event", async () => {
    map.updateSize();
    renderFollowMode("dashboard");

    // Wait for the initial publish
    await vi.waitFor(() => {
      expect(capturedExtent).not.toBeNull();
    });

    const extentBefore = [...capturedExtent!];
    capturedExtent = null; // reset so we can detect a new publish

    // Pan the map, then fire moveend — FollowMode listens to this event
    map.getView().setCenter([100000, 200000]);
    map.dispatchEvent("moveend");

    // After moveend, FollowMode calls setBigMapExtent again → async re-render
    await vi.waitFor(() => {
      expect(capturedExtent).not.toBeNull();
      expect(capturedExtent!.length).toBe(4);
    });

    // The new extent should differ from the pre-pan extent
    expect(capturedExtent).not.toEqual(extentBefore);
  });
});
