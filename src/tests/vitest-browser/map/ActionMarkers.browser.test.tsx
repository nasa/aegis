/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `ActionMarkers`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map, a Redux store
 * with the minimal slices the component reads, and real
 * FeatureSourcesProvider / MapMenuProvider contexts.
 * `useCoordConverters` is mocked to avoid the Automerge mission-doc dependency.
 *
 * Verifies:
 *  - Action VectorLayer added at ACTIONS z-index
 *  - No features when no parent (station/poi/traverse) is selected
 *  - Renders actions belonging to selected station (sectionSelected=station)
 *  - Renders actions belonging to selected POI (sectionSelected=poi)
 *  - Renders actions belonging to selected traverse (sectionSelected=evas + selectedTraverseUuid)
 *  - Skips actions where enabled=false
 *  - Skips actions with missing location
 *  - Display toggle off (mapDisplayActions.show=false) hides all actions
 *  - Dashboard shows in-progress station/traverse actions without any selection
 *  - Dashboard hides actions whose sequence item is not in-progress
 *  - Layer removed on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { Cookies, CookiesProvider } from "react-cookie";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { ActionMarkers } from "components/interface/map/behaviors/ActionMarkers";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { actionSlice } from "store/action";
import { stationSlice } from "store/station";
import { poiSlice } from "store/poi";
import { traverseSlice } from "store/traverse";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
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

// Mutable mock Automerge doc — tests populate actions/traverses here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STATION_UUID = "station-uuid-am-1";
const POI_UUID = "poi-uuid-am-1";
const TRAVERSE_UUID = "traverse-uuid-am-1";
const EVA_UUID = "eva-uuid-am-1";
const REX_UUID = "rex-uuid-am-1";
const ACTION_STATION_UUID = "action-station-1";
const ACTION_POI_UUID = "action-poi-1";
const ACTION_TRAVERSE_UUID = "action-traverse-1";
const ACTION_DISABLED_UUID = "action-disabled-1";

function makeAction(
  uuid: string,
  parentField: "stationUuid" | "poiUuid" | "traverseUuid",
  parentUuid: string,
  opts: { enabled?: boolean; location?: AEGISPoint | null } = {}
): Action {
  return {
    uuid,
    name: `Action ${uuid.slice(-1)}`,
    icon: "1f4a1",
    enabled: opts.enabled ?? true,
    location: opts.location !== undefined ? opts.location : { lat: 1, lng: 2 },
    [parentField]: parentUuid,
    updatedAt: new Date().toISOString(),
  } as unknown as Action;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      action: actionSlice.reducer,
      station: stationSlice.reducer,
      poi: poiSlice.reducer,
      traverse: traverseSlice.reducer,
      eva: evaSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
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
let testCookies: Cookies;

let actionSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceAndSetterCapture(): null {
  actionSource = useFeatureSourcesContext().actionSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findActionLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.ACTIONS) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderActionMarkers(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode }}>
              <ActionMarkers />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  actionSource = null;
  capturedSetters = null;
  harness = createReactHarness();
  testCookies = new Cookies();

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

describe("ActionMarkers", () => {
  it("adds an action VectorLayer at ACTIONS z-index", () => {
    store = makeStore();
    renderActionMarkers();
    const layer = findActionLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.ACTIONS);
  });

  it("renders no features when no parent is selected", () => {
    const action = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID);
    mockMissionDoc.actions = { [ACTION_STATION_UUID]: action } as unknown as Mission["actions"];
    store = makeStore();

    renderActionMarkers();
    expect(actionSource!.getFeatures()).toHaveLength(0);
  });

  it("renders actions belonging to selected station (sectionSelected=station)", () => {
    const action = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID);
    mockMissionDoc.actions = { [ACTION_STATION_UUID]: action } as unknown as Mission["actions"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(ACTION_STATION_UUID);
    expect(features[0].get("mapItemType")).toBe("action");
    expect(features[0].get("emoji")).toBe("1f4a1");
    expect(features[0].get("name")).toBe("Action 1");
  });

  it("labels STM (v2) actions from the definition + custom conjunctions", () => {
    const action = {
      ...makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID),
      name: "ignored-random-name",
      stmAction: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
    } as unknown as Action;
    mockMissionDoc.actions = { [ACTION_STATION_UUID]: action } as unknown as Mission["actions"];
    mockMissionDoc.actionSystemVersion = 2;
    mockMissionDoc.actionDefinitions = {
      verbs: { v1: { name: "Sample" } },
      nouns: { n1: { name: "Rock" } },
      adjectives: { a1: { name: "Crater" } },
    } as unknown as Mission["actionDefinitions"];
    mockMissionDoc.actionDefinitionConjunctions = { verbToNoun: "on", nounToAdjective: "within" };

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].get("name")).toBe("Sample on Rock within Crater");
  });

  it("renders actions belonging to selected POI (sectionSelected=poi)", () => {
    const action = makeAction(ACTION_POI_UUID, "poiUuid", POI_UUID);
    mockMissionDoc.actions = { [ACTION_POI_UUID]: action } as unknown as Mission["actions"];

    store = makeStore({
      poi: {
        ...poiSlice.getInitialState(),
        selectedPoiUuid: POI_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "poi",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(ACTION_POI_UUID);
  });

  it("renders actions belonging to selected traverse (sectionSelected=evas)", () => {
    const traverse = {
      uuid: TRAVERSE_UUID,
      name: "T",
      path: [
        { lat: 0, lng: 0 },
        { lat: 1, lng: 1 },
      ],
      updatedAt: new Date().toISOString(),
    } as unknown as Traverse;
    const action = makeAction(ACTION_TRAVERSE_UUID, "traverseUuid", TRAVERSE_UUID);
    mockMissionDoc.actions = {
      [ACTION_TRAVERSE_UUID]: action,
    } as unknown as Mission["actions"];
    mockMissionDoc.traverses = {
      [TRAVERSE_UUID]: traverse,
    } as unknown as Mission["traverses"];

    store = makeStore({
      eva: {
        ...evaSlice.getInitialState(),
        selectedEvaUuid: EVA_UUID,
        selectedEvaSequenceItemUuid: TRAVERSE_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "evas",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(ACTION_TRAVERSE_UUID);
  });

  it("skips actions where enabled=false", () => {
    const enabledAction = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID);
    const disabledAction = makeAction(ACTION_DISABLED_UUID, "stationUuid", STATION_UUID, {
      enabled: false,
    });
    mockMissionDoc.actions = {
      [ACTION_STATION_UUID]: enabledAction,
      [ACTION_DISABLED_UUID]: disabledAction,
    } as unknown as Mission["actions"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(ACTION_STATION_UUID);
  });

  it("skips actions with missing location", () => {
    const noLocAction = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID, {
      location: null,
    });
    mockMissionDoc.actions = {
      [ACTION_STATION_UUID]: noLocAction,
    } as unknown as Mission["actions"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    expect(actionSource!.getFeatures()).toHaveLength(0);
  });

  it("hides all actions when mapDisplayActions.show is toggled off", () => {
    const action = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID);
    mockMissionDoc.actions = { [ACTION_STATION_UUID]: action } as unknown as Mission["actions"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_UUID,
      },
      interface: {
        ...interfaceSlice.getInitialState(),
        sectionSelectedLabel: "station",
      },
    } as PartialPreloadedState);

    renderActionMarkers();
    expect(actionSource!.getFeatures()).toHaveLength(1);

    flushSync(() => {
      capturedSetters!.setSubmenuActions({ show: false, showLabels: false });
    });

    expect(actionSource!.getFeatures()).toHaveLength(0);
  });

  it("renders in-progress station actions on the dashboard without any selection", () => {
    const stationAction = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID);
    mockMissionDoc.actions = {
      [ACTION_STATION_UUID]: stationAction,
    } as unknown as Mission["actions"];
    mockMissionDoc.evas = {
      [EVA_UUID]: {
        uuid: EVA_UUID,
        sequence: [{ type: "station", uuid: STATION_UUID }],
      },
    } as unknown as Mission["evas"];
    mockMissionDoc.rexes = {
      [REX_UUID]: {
        uuid: REX_UUID,
        isRunning: true,
        evaUuid: EVA_UUID,
        stationEntries: { [STATION_UUID]: { rexStatus: "in-progress" } },
        traverseEntries: {},
      },
    } as unknown as Mission["rexes"];

    store = makeStore();

    renderActionMarkers("dashboard");
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(ACTION_STATION_UUID);
  });

  it("renders in-progress traverse actions on the dashboard", () => {
    const traverseAction = makeAction(ACTION_TRAVERSE_UUID, "traverseUuid", TRAVERSE_UUID);
    mockMissionDoc.actions = {
      [ACTION_TRAVERSE_UUID]: traverseAction,
    } as unknown as Mission["actions"];
    mockMissionDoc.evas = {
      [EVA_UUID]: {
        uuid: EVA_UUID,
        sequence: [{ type: "traverse", uuid: TRAVERSE_UUID }],
      },
    } as unknown as Mission["evas"];
    mockMissionDoc.rexes = {
      [REX_UUID]: {
        uuid: REX_UUID,
        isRunning: true,
        evaUuid: EVA_UUID,
        stationEntries: {},
        traverseEntries: { [TRAVERSE_UUID]: { rexStatus: "in-progress" } },
      },
    } as unknown as Mission["rexes"];

    store = makeStore();

    renderActionMarkers("dashboard");
    const features = actionSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(ACTION_TRAVERSE_UUID);
  });

  it("hides dashboard actions whose sequence item is not in-progress", () => {
    const pendingAction = makeAction(ACTION_STATION_UUID, "stationUuid", STATION_UUID);
    mockMissionDoc.actions = {
      [ACTION_STATION_UUID]: pendingAction,
    } as unknown as Mission["actions"];
    mockMissionDoc.evas = {
      [EVA_UUID]: {
        uuid: EVA_UUID,
        sequence: [{ type: "station", uuid: STATION_UUID }],
      },
    } as unknown as Mission["evas"];
    mockMissionDoc.rexes = {
      [REX_UUID]: {
        uuid: REX_UUID,
        isRunning: true,
        evaUuid: EVA_UUID,
        stationEntries: { [STATION_UUID]: { rexStatus: "pending" } },
        traverseEntries: {},
      },
    } as unknown as Mission["rexes"];

    store = makeStore();

    renderActionMarkers("dashboard");
    expect(actionSource!.getFeatures()).toHaveLength(0);
  });

  it("removes its action layer from the map on unmount", () => {
    store = makeStore();
    renderActionMarkers();
    expect(findActionLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findActionLayer()).toBeNull();
  });
});
