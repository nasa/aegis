/* eslint-disable react-hooks/globals */
/**
 * Browser-mode tests for `Circles`.
 *
 * Mocks:
 *  - `useCoordConverters` — avoids Automerge mission-doc dependency
 *  - `utils/useDocSelector` — provides mutable circleDefinitions + landerLocation
 *
 * Verifies:
 *  - No layers added when circleDefinitions / landerLocation / preset controls are missing
 *  - One layer per visible lander circle definition
 *  - Layer added at Z_INDEX.CIRCLES
 *  - Circle with visible=false is skipped
 *  - Dashed circle with altColor adds a second (alt) layer
 *  - Station circles rendered for EVA-sequence stations with matching mapCircleControls
 *  - Station circles rendered for as-planned stations (no EVA selected) — the primary use-case
 *  - As-planned station circles hidden when `mapDisplayStations.show` is toggled off
 *  - As-planned station in a hidden folder gets no circle
 *  - As-planned station in a visible folder gets circle
 *  - Station circles hidden when mapDisplayStations.showCircles=false
 *  - All circle layers removed on unmount
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import { CookiesProvider, Cookies } from "react-cookie";

import { MapContext } from "components/interface/map/MapProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { Circles } from "components/interface/map/behaviors/Circles";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { stationSlice } from "store/station";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { rexSlice } from "store/rex";
import { poiSlice } from "store/poi";
import { traverseSlice } from "store/traverse";
import { measureSlice } from "store/measure";
import { presetSlice } from "store/preset";
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

// Mutable mission-doc fixture
const mockMissionDoc: Partial<Mission> & {
  circleDefinitions: CircleDefinitions | null;
  landerLocation: AEGISPoint | null;
} = { circleDefinitions: null, landerLocation: null };

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CIRCLE_UUID = "circle-uuid-1";
const PRESET_UUID = "preset-uuid-1";
const STATION_UUID = "station-uuid-1";
const STATION_B_UUID = "station-uuid-2";
const EVA_UUID = "eva-uuid-1";
const FOLDER_UUID = "station-folder-1";

function makeCircleDef(uuid: string, radius: number, name = "Test Circle"): CircleDefinitions {
  return { [uuid]: { name, radius } };
}

function makePresetCircleControl(
  uuid: string,
  visible: boolean,
  isDashed = false,
  altColor = ""
): MapCircleControls {
  return {
    [uuid]: {
      uuid,
      visible,
      style: {
        opacity: 100,
        contrast: 0,
        brightness: 0,
        saturation: 0,
        blendMode: "normal",
        color: "#ff0000",
        weight: 2,
        fillColor: "",
        fillOpacity: 0,
        isDashed,
        dashLen: 10,
        altColor,
        altOpacity: 1,
      },
    },
  };
}

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStation(uuid: string, lat: number, lng: number, circleVisible = false): Station {
  return {
    uuid,
    name: `Station ${uuid.slice(-1)}`,
    icon: "1f535",
    location: { lat, lng },
    mapCircleControls: circleVisible ? makePresetCircleControl(CIRCLE_UUID, true) : {},
    updatedAt: new Date().toISOString(),
    refUuid: null,
  } as unknown as Station;
}

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      station: stationSlice.reducer,
      eva: evaSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      rex: rexSlice.reducer,
      poi: poiSlice.reducer,
      traverse: traverseSlice.reducer,
      measure: measureSlice.reducer,
      preset: presetSlice.reducer,
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
let testCookies: Cookies;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SetterCapture(): null {
  capturedSetters = useMapMenuSetters();
  return null;
}

function renderCircles(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <MapMenuProvider>
          <SetterCapture />
          <MapContext.Provider value={{ map, mode }}>
            <Circles />
          </MapContext.Provider>
        </MapMenuProvider>
      </Provider>
    </CookiesProvider>
  );
}

/** Count layers at CIRCLES z-index */
function circleLayerCount(): number {
  return map
    .getLayers()
    .getArray()
    .filter((l) => l.getZIndex() === Z_INDEX.CIRCLES).length;
}

beforeEach(() => {
  capturedSetters = null;
  mockMissionDoc.circleDefinitions = null;
  mockMissionDoc.landerLocation = null;
  mockMissionDoc.stations = undefined;
  mockMissionDoc.evas = undefined;
  harness = createReactHarness();
  testCookies = new Cookies();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "400px";
  mapContainer.style.height = "300px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });

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

describe("Circles", () => {
  it("adds no layers when circleDefinitions is null", () => {
    mockMissionDoc.circleDefinitions = null;
    mockMissionDoc.landerLocation = { lat: 0, lng: 0 };
    renderCircles();
    expect(circleLayerCount()).toBe(0);
  });

  it("adds no layers when landerLocation is null (no preset controls provided)", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;
    renderCircles();
    expect(circleLayerCount()).toBe(0);
  });

  it("adds no lander circle layers when no preset selected", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };
    // No preset in store → no presetCircleControls
    renderCircles();
    expect(circleLayerCount()).toBe(0);
  });

  it("adds one layer per visible lander circle at Z_INDEX.CIRCLES", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };

    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapCircleControls: makePresetCircleControl(CIRCLE_UUID, true),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);
  });

  it("skips lander circle when preset control has visible=false", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };

    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapCircleControls: makePresetCircleControl(CIRCLE_UUID, false),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(0);
  });

  it("adds two layers for a dashed circle with altColor (main + alt)", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };

    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapCircleControls: makePresetCircleControl(CIRCLE_UUID, true, true, "#ffffff"),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderCircles();
    // main dashed + alt dashed
    expect(circleLayerCount()).toBe(2);
  });

  it("dashed circle with empty altColor only adds one layer", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };

    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            // isDashed=true but altColor="" → no second layer
            mapCircleControls: makePresetCircleControl(CIRCLE_UUID, true, true, ""),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);
  });

  it("adds multiple layers for multiple visible circle definitions", () => {
    const CIRCLE_UUID_2 = "circle-uuid-2";
    mockMissionDoc.circleDefinitions = {
      ...makeCircleDef(CIRCLE_UUID, 500),
      ...makeCircleDef(CIRCLE_UUID_2, 1000, "Far Circle"),
    };
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };

    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapCircleControls: {
              ...makePresetCircleControl(CIRCLE_UUID, true),
              ...makePresetCircleControl(CIRCLE_UUID_2, true),
            },
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Station circles — EVA-sequence stations
  // -------------------------------------------------------------------------

  it("adds station circle when EVA station has visible mapCircleControl", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null; // lander circles off

    const stationWithCircle = makeStation(STATION_UUID, 5, 10, true);
    const eva = {
      uuid: EVA_UUID,
      name: "EVA 1",
      traverseColor: "#ff0000",
      sequence: [{ uuid: STATION_UUID, type: "station" }],
      updatedAt: new Date().toISOString(),
    } as unknown as Eva;
    mockMissionDoc.stations = {
      [STATION_UUID]: stationWithCircle,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);
  });

  it("station circle hidden when EVA-station mapCircleControl visible=false", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const stationWithHiddenCircle = makeStation(STATION_UUID, 5, 10, false);
    const eva = {
      uuid: EVA_UUID,
      name: "EVA 1",
      traverseColor: "#ff0000",
      sequence: [{ uuid: STATION_UUID, type: "station" }],
      updatedAt: new Date().toISOString(),
    } as unknown as Eva;
    mockMissionDoc.stations = {
      [STATION_UUID]: stationWithHiddenCircle,
    } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Station circles — as-planned stations (no EVA selected)
  // This is the primary real-world use-case: user toggles Circles on from the
  // eyeball menu while browsing stations with no EVA active. The original
  // implementation used selectEvaStations() which returned [] in this case,
  // making station circles invisible whenever no EVA was selected.
  // -------------------------------------------------------------------------

  it("adds circle for as-planned station when no EVA is selected", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const station = makeStation(STATION_UUID, 5, 10, true);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      // No selectedEvaUuid → selectEvaStations() would return [] (the old bug)
      rex: { ...rexSlice.getInitialState(), rexesFromDb: [] },
    } as PartialPreloadedState);

    renderCircles();
    // Station is as-planned and mapDisplayStations.show=true (default) → circle shown
    expect(circleLayerCount()).toBe(1);
  });

  it("adds no circle for as-planned station when its mapCircleControl visible=false", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const station = makeStation(STATION_UUID, 5, 10, false); // visible=false
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      rex: { ...rexSlice.getInitialState(), rexesFromDb: [] },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(0);
  });

  it("hides as-planned station circle when stations eyeball (show) is toggled off", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const station = makeStation(STATION_UUID, 5, 10, true);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      rex: { ...rexSlice.getInitialState(), rexesFromDb: [] },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);

    // Toggle the stations eyeball off
    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: false,
        showLabels: false,
        showWalkbacks: false,
        showCircles: true,
      });
    });
    expect(circleLayerCount()).toBe(0);
  });

  it("hides as-planned station circle in a hidden folder", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const stationA = makeStation(STATION_UUID, 5, 10, true); // no folder → shown
    const stationB = makeStation(STATION_B_UUID, 15, 25, true); // hidden folder → no circle
    mockMissionDoc.stations = {
      [STATION_UUID]: stationA,
      [STATION_B_UUID]: stationB,
    } as unknown as Mission["stations"];

    store = makeStore({
      interface: {
        ...interfaceSlice.getInitialState(),
        folders: [
          { uuid: FOLDER_UUID, type: "station", items: [STATION_B_UUID], name: "Hidden Folder" },
        ],
        foldersInterface: [{ uuid: FOLDER_UUID, visible: false }],
      },
      rex: { ...rexSlice.getInitialState(), rexesFromDb: [] },
    } as PartialPreloadedState);

    renderCircles();
    // Only stationA (not in a hidden folder) gets a circle
    expect(circleLayerCount()).toBe(1);
  });

  it("shows as-planned station circle in a visible folder", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const station = makeStation(STATION_UUID, 5, 10, true);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      interface: {
        ...interfaceSlice.getInitialState(),
        folders: [
          { uuid: FOLDER_UUID, type: "station", items: [STATION_UUID], name: "Visible Folder" },
        ],
        foldersInterface: [{ uuid: FOLDER_UUID, visible: true }],
      },
      rex: { ...rexSlice.getInitialState(), rexesFromDb: [] },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // showCircles toggle — covers both EVA-sequence and as-planned stations
  // -------------------------------------------------------------------------

  it("station circles hidden when mapDisplayStations.showCircles=false (as-planned)", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = null;

    const station = makeStation(STATION_UUID, 5, 10, true);
    mockMissionDoc.stations = { [STATION_UUID]: station } as unknown as Mission["stations"];

    store = makeStore({
      rex: { ...rexSlice.getInitialState(), rexesFromDb: [] },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);

    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: true,
        showLabels: false,
        showWalkbacks: true,
        showCircles: false,
      });
    });
    expect(circleLayerCount()).toBe(0);
  });

  it("removes all circle layers on unmount", () => {
    mockMissionDoc.circleDefinitions = makeCircleDef(CIRCLE_UUID, 500);
    mockMissionDoc.landerLocation = { lat: 10, lng: 20 };

    store = makeStore({
      preset: {
        ...presetSlice.getInitialState(),
        selectedPresetUuid: PRESET_UUID,
        presets: [
          {
            uuid: PRESET_UUID,
            mapCircleControls: makePresetCircleControl(CIRCLE_UUID, true),
          } as unknown as Preset,
        ],
      },
    } as PartialPreloadedState);

    renderCircles();
    expect(circleLayerCount()).toBe(1);

    harness.unmount();
    harness = createReactHarness();
    expect(circleLayerCount()).toBe(0);
  });
});
