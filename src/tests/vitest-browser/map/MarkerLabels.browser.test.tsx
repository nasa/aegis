/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `MarkerLabels`.
 *
 * Mounts the headless behavior against a hand-rolled OL Map + minimal Redux
 * store. `useCoordConverters` and `useMissionDocSelector` are mocked because
 * they would otherwise require an Automerge mission doc fixture.
 *
 * Verifies:
 *  - Label VectorLayer added at PLACE_LABELS z-index
 *  - Station label features written to the shared labelSource when display + label
 *    toggles are on
 *  - Station labels (including the selected station) respect the showLabels toggle —
 *    they are NOT force-shown when labels are turned off
 *  - Hover-induced labels appear and are flagged isHover
 *  - The lander label is hover-only (no permanent label)
 *  - Labels stay visible as reference while an unrelated mapDirective is active
 *  - Stale labels removed when the underlying station is removed
 *  - Label opacities computed and stored on features (default = 1, since no overlap)
 *  - Layer removed on unmount
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import { flushSync } from "react-dom";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";

import { CookiesProvider, Cookies } from "react-cookie";
import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { MarkerLabels } from "components/interface/map/behaviors/MarkerLabels";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { stationSlice } from "store/station";
import { evaSlice } from "store/eva";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { rexSlice } from "store/rex";
import { poiSlice } from "store/poi";
import { traverseSlice } from "store/traverse";
import { measureSlice } from "store/measure";
import { actionSlice } from "store/action";
import { hoverSlice } from "store/hover";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

const mockMissionDoc: Partial<Mission> & { landerLocation: AEGISPoint | null } = {
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

const STATION_A_UUID = "station-a";
const STATION_B_UUID = "station-b";
const POI_UUID = "poi-1";
const ACTION_UUID = "action-1";
const EVA_UUID = "eva-1";
const REX_UUID = "rex-1";

function makeStation(uuid: string, lat: number, lng: number, name?: string): Station {
  return {
    uuid,
    name: name ?? `Station ${uuid.slice(-1)}`,
    icon: "1f535",
    location: { lat, lng },
    mapCircleControls: {},
    updatedAt: new Date().toISOString(),
    refUuid: null,
  } as unknown as Station;
}

function makePoi(uuid: string, lat: number, lng: number, name?: string): POI {
  return {
    uuid,
    name: name ?? `POI ${uuid.slice(-1)}`,
    icon: "1f534",
    location: { lat, lng },
    updatedAt: new Date().toISOString(),
  } as unknown as POI;
}

function makeAction(uuid: string, lat: number, lng: number, stationUuid: string): Action {
  return {
    uuid,
    name: `Action ${uuid.slice(-1)}`,
    icon: "1f4cd",
    location: { lat, lng },
    stationUuid,
    enabled: true,
    updatedAt: new Date().toISOString(),
  } as unknown as Action;
}

function makeEva(uuid: string, stationUuids: string[]): Eva {
  return {
    uuid,
    name: "Test EVA",
    traverseColor: "#ff0000",
    egressLocationUuid: "lander",
    ingressLocationUuid: "lander",
    sequence: stationUuids.map((u) => ({ uuid: u, type: "station" })),
    updatedAt: new Date().toISOString(),
  } as unknown as Eva;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

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
      action: actionSlice.reducer,
      hover: hoverSlice.reducer,
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
let labelSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceAndSetterCapture(): null {
  labelSource = useFeatureSourcesContext().labelSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findLabelLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.PLACE_LABELS) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function renderMarkerLabels(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode }}>
              <MarkerLabels />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  mockMissionDoc.landerLocation = null;
  mockMissionDoc.stations = undefined;
  mockMissionDoc.evas = undefined;
  mockMissionDoc.pois = undefined;
  mockMissionDoc.actions = undefined;
  mockMissionDoc.actionSystemVersion = undefined;
  mockMissionDoc.actionDefinitions = undefined;
  mockMissionDoc.actionDefinitionConjunctions = undefined;
  labelSource = null;
  capturedSetters = null;
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
  // Give the map a frame state so getPixelFromCoordinate works inside layout effects
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

describe("MarkerLabels", () => {
  it("adds a label VectorLayer at PLACE_LABELS z-index", () => {
    store = makeStore();
    renderMarkerLabels();
    const layer = findLabelLayer();
    expect(layer).not.toBeNull();
    expect(layer!.getZIndex()).toBe(Z_INDEX.PLACE_LABELS);
  });

  it("renders no labels when there is nothing to label (no stations, no selection, no hover)", () => {
    store = makeStore();
    renderMarkerLabels();
    expect(labelSource!.getFeatures()).toHaveLength(0);
  });

  it("renders station labels when showLabels is enabled", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: { ...evaSlice.getInitialState(), selectedEvaUuid: EVA_UUID },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "evas" },
    } as PartialPreloadedState);
    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: true,
        showLabels: true,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    const features = labelSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe(`station-${STATION_A_UUID}`);
    expect(features[0].get("name")).toBe(stationA.name);
    expect(features[0].get("labelType")).toBe("station");
    expect(features[0].get("isHover")).toBe(false);
  });

  it("does not show the selected station label when showLabels is off", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A_UUID,
      },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "station" },
    } as PartialPreloadedState);

    renderMarkerLabels();

    // Default mapDisplayStations.showLabels = false — no label should appear.
    expect(labelSource!.getFeatures()).toHaveLength(0);
  });

  it("does not show the selected POI label when showLabels is off", () => {
    const poi = makePoi(POI_UUID, 10, 20);
    mockMissionDoc.pois = { [POI_UUID]: poi } as unknown as Mission["pois"];

    store = makeStore({
      poi: {
        ...poiSlice.getInitialState(),
        selectedPoiUuid: POI_UUID,
      },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "poi" },
    } as PartialPreloadedState);

    renderMarkerLabels();

    // Default mapDisplayPois.showLabels = false — no label should appear.
    expect(labelSource!.getFeatures()).toHaveLength(0);
  });

  it("renders hover tooltip label flagged as isHover", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_A_UUID,
        mapItemType: "station",
      },
    } as PartialPreloadedState);

    renderMarkerLabels();

    const feature = labelSource!.getFeatureById(`station-${STATION_A_UUID}`);
    expect(feature).not.toBeNull();
    expect(feature!.get("isHover")).toBe(true);
    // Hover labels render at full opacity even if overlapped
    expect(feature!.get("labelOpacity")).toBe(1);
  });

  it("suppresses the hover tooltip label when the marker type is hidden", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_A_UUID,
        mapItemType: "station",
      },
    } as PartialPreloadedState);

    renderMarkerLabels();

    // Turn stations off in the eyeball menu — the hovered station's marker is
    // hidden, so its label must not appear on hover.
    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: false,
        showLabels: false,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    expect(labelSource!.getFeatureById(`station-${STATION_A_UUID}`)).toBeNull();
  });

  it("still shows the hover tooltip label for the selected station when hidden", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A_UUID,
      },
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: STATION_A_UUID,
        mapItemType: "station",
      },
    } as PartialPreloadedState);

    renderMarkerLabels();

    // Stations off in the eyeball menu, but the hovered station is selected — its
    // marker stays visible, so its label must appear on hover.
    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: false,
        showLabels: false,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    const feature = labelSource!.getFeatureById(`station-${STATION_A_UUID}`);
    expect(feature).not.toBeNull();
    expect(feature!.get("isHover")).toBe(true);
  });

  it("keeps labels visible as reference while an unrelated mapDirective is active", () => {
    // During an edit, other markers' labels stay visible (non-interactive) so the
    // user can see reference points).
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A_UUID,
      },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "station" },
      map: {
        ...mapSlice.getInitialState(),
        mapDirective: {
          uuid: "some-traverse-uuid",
          mapItemType: "traverse",
          mapAction: "editPolyline",
        } as MapDirective,
      },
    } as PartialPreloadedState);

    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: true,
        showLabels: true,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    // With labels enabled, the station's label stays visible during an unrelated edit.
    expect(labelSource!.getFeatureById(`station-${STATION_A_UUID}`)).not.toBeNull();
  });

  it("removes a stale label when the station is removed from the doc", () => {
    // Two as-planned stations (no rex/eva → both count as as-planned), shown via
    // the standard show + showLabels path.
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const stationB = makeStation(STATION_B_UUID, 15, 25);
    mockMissionDoc.stations = {
      [STATION_A_UUID]: stationA,
      [STATION_B_UUID]: stationB,
    } as unknown as Mission["stations"];

    store = makeStore();

    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: true,
        showLabels: true,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    // Both as-planned stations are labeled.
    expect(labelSource!.getFeatures()).toHaveLength(2);

    // Remove STATION_B from the doc.
    mockMissionDoc.stations = {
      [STATION_A_UUID]: stationA,
    } as unknown as Mission["stations"];
    // Re-render in place (reconcile) so useMissionDocSelector re-reads the mutated doc.
    // React preserves MapMenuProvider state across reconcile calls on the same root.
    renderMarkerLabels();

    expect(labelSource!.getFeatures()).toHaveLength(1);
    expect(labelSource!.getFeatureById(`station-${STATION_A_UUID}`)).not.toBeNull();
    expect(labelSource!.getFeatureById(`station-${STATION_B_UUID}`)).toBeNull();
  });

  it("computes a labelOpacity property on each label feature", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];

    store = makeStore({
      eva: { ...evaSlice.getInitialState(), selectedEvaUuid: EVA_UUID },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "evas" },
    } as PartialPreloadedState);
    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuStations({
        show: true,
        showLabels: true,
        showWalkbacks: false,
        showCircles: false,
      });
    });

    const feature = labelSource!.getFeatureById(`station-${STATION_A_UUID}`)!;
    // Single label — no overlap — should be fully opaque
    expect(feature.get("labelOpacity")).toBe(1);
  });

  it("renders POI label when display.show + showLabels are on", () => {
    const poi = makePoi(POI_UUID, 10, 20);
    mockMissionDoc.pois = { [POI_UUID]: poi } as unknown as Mission["pois"];

    store = makeStore();
    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuPois({ show: true, showLabels: true });
    });

    const feature = labelSource!.getFeatureById(`poi-${POI_UUID}`);
    expect(feature).not.toBeNull();
    expect(feature!.get("labelType")).toBe("poi");
  });

  it("renders action label for selected station when actions.showLabels is on", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const action = makeAction(ACTION_UUID, 11, 21, STATION_A_UUID);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.actions = { [ACTION_UUID]: action } as unknown as Mission["actions"];

    store = makeStore({
      station: {
        ...stationSlice.getInitialState(),
        selectedStationUuid: STATION_A_UUID,
      },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "station" },
    } as PartialPreloadedState);
    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuActions({ show: true, showLabels: true });
    });

    const feature = labelSource!.getFeatureById(`action-${ACTION_UUID}`);
    expect(feature).not.toBeNull();
    expect(feature!.get("labelType")).toBe("action");
    expect(feature!.get("name")).toBe("Action 1");
  });

  it("labels STM (v2) actions from the definition + custom conjunctions", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const action = {
      ...makeAction(ACTION_UUID, 11, 21, STATION_A_UUID),
      name: "ignored-random-name",
      stmAction: true,
      actionDefinition: { verbUuid: "v1", nounUuid: "n1", adjectiveUuid: "a1" },
    } as unknown as Action;
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.actions = { [ACTION_UUID]: action } as unknown as Mission["actions"];
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
        selectedStationUuid: STATION_A_UUID,
      },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "station" },
    } as PartialPreloadedState);
    renderMarkerLabels();

    flushSync(() => {
      capturedSetters!.setSubmenuActions({ show: true, showLabels: true });
    });

    const feature = labelSource!.getFeatureById(`action-${ACTION_UUID}`);
    expect(feature).not.toBeNull();
    expect(feature!.get("name")).toBe("Sample on Rock within Crater");
  });

  it("renders action labels on the dashboard for in-progress sequence stations", () => {
    // Dashboard has no marker selection — action labels follow the running
    // REX's in-progress sequence item, mirroring ActionMarkers.
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const action = makeAction(ACTION_UUID, 11, 21, STATION_A_UUID);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.actions = { [ACTION_UUID]: action } as unknown as Mission["actions"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.rexes = {
      [REX_UUID]: {
        uuid: REX_UUID,
        isRunning: true,
        evaUuid: EVA_UUID,
        stationEntries: { [STATION_A_UUID]: { rexStatus: "in-progress" } },
        traverseEntries: {},
      },
    } as unknown as Mission["rexes"];

    store = makeStore({
      eva: { ...evaSlice.getInitialState(), selectedEvaUuid: EVA_UUID },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "evas" },
    } as PartialPreloadedState);
    renderMarkerLabels("dashboard");

    flushSync(() => {
      capturedSetters!.setSubmenuActions({ show: true, showLabels: true });
    });

    const feature = labelSource!.getFeatureById(`action-${ACTION_UUID}`);
    expect(feature).not.toBeNull();
    expect(feature!.get("labelType")).toBe("action");
  });

  it("hides dashboard action labels when the sequence item is not in-progress", () => {
    const stationA = makeStation(STATION_A_UUID, 10, 20);
    const action = makeAction(ACTION_UUID, 11, 21, STATION_A_UUID);
    const eva = makeEva(EVA_UUID, [STATION_A_UUID]);
    mockMissionDoc.stations = { [STATION_A_UUID]: stationA } as unknown as Mission["stations"];
    mockMissionDoc.actions = { [ACTION_UUID]: action } as unknown as Mission["actions"];
    mockMissionDoc.evas = { [EVA_UUID]: eva } as unknown as Mission["evas"];
    mockMissionDoc.rexes = {
      [REX_UUID]: {
        uuid: REX_UUID,
        isRunning: true,
        evaUuid: EVA_UUID,
        stationEntries: { [STATION_A_UUID]: { rexStatus: "pending" } },
        traverseEntries: {},
      },
    } as unknown as Mission["rexes"];

    store = makeStore({
      eva: { ...evaSlice.getInitialState(), selectedEvaUuid: EVA_UUID },
      interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "evas" },
    } as PartialPreloadedState);
    renderMarkerLabels("dashboard");

    flushSync(() => {
      capturedSetters!.setSubmenuActions({ show: true, showLabels: true });
    });

    expect(labelSource!.getFeatureById(`action-${ACTION_UUID}`)).toBeNull();
  });

  it("does not render a permanent lander label", () => {
    // The lander label is hover-only — it must not appear without a hover.
    mockMissionDoc.landerLocation = { lat: 5, lng: 6 };
    store = makeStore();
    renderMarkerLabels();

    expect(labelSource!.getFeatureById("lander")).toBeNull();
  });

  it("renders the lander label on hover", () => {
    mockMissionDoc.landerLocation = { lat: 5, lng: 6 };
    store = makeStore({
      hover: {
        ...hoverSlice.getInitialState(),
        mapItemUuid: "lander",
        mapItemType: "lander",
      },
    } as PartialPreloadedState);
    renderMarkerLabels();

    const feature = labelSource!.getFeatureById("lander");
    expect(feature).not.toBeNull();
    expect(feature!.get("labelType")).toBe("lander");
    expect(feature!.get("name")).toBe("Lander");
    expect(feature!.get("isHover")).toBe(true);
  });

  it("removes the label layer on unmount", () => {
    store = makeStore();
    renderMarkerLabels();
    expect(findLabelLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findLabelLayer()).toBeNull();
  });
});
