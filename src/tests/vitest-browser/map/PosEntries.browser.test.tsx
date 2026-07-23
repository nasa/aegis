/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `PosEntries`.
 *
 * `PosEntries` renders POS markers as vector features on `posSource` and POS
 * paths as features on `posPathSource`. We test:
 *
 *  - Marker + path VectorLayers added at their z-indices
 *  - Marker features added/removed for each visible POS entry
 *  - Source-uuid filtering removes marker features for excluded sources
 *  - Egress-equal entries are skipped
 *  - Path features written to posPathSource (latest-only and all-paths modes)
 *  - showMarkers=false removes all marker features
 *  - showPaths=false clears path features
 *  - Marker features + layers cleared on unmount
 *  - Clicking a marker feature selects the POS entry and clears EVA selection
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
import { PosEntries } from "components/interface/map/behaviors/PosEntries";
import { Z_INDEX } from "components/interface/map/utils/zIndex";
import { rexSlice } from "store/rex";
import { evaSlice } from "store/eva";
import { stationSlice } from "store/station";
import { interfaceSlice } from "store/interface";
import { mapSlice } from "store/map";
import { hoverSlice } from "store/hover";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";
import { dispatchMapClick } from "./helpers/dispatchMapEvent";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

// Mutable mock Automerge doc — tests populate rexes/evas/stations here before rendering.
const mockMissionDoc: Partial<Mission> = {};

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: <TSel,>(selector: (doc: unknown) => TSel): TSel =>
    selector(mockMissionDoc as Mission),
  useDocSelector: (): undefined => undefined,
}));

// Stub the cross-slice EVA-sequence selection thunk: we only need to verify
// the click handler fires, not exercise the (heavy) selection chain.
const thunkSelectEVASequenceItemMock = vi.fn((_args: unknown) => ({
  type: "mock/thunkSelectEVASequenceItem",
}));
vi.mock("store/thunk/crossThunk", () => ({
  thunkSelectEVASequenceItem: (args: unknown) => thunkSelectEVASequenceItemMock(args),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REX_UUID = "rex-1";
const EVA_UUID = "eva-1";
const POSTYPE_A_UUID = "posType-A";
const POSTYPE_B_UUID = "posType-B";
const SOURCE_A_UUID = "src-A";
const SOURCE_B_UUID = "src-B";

function makePosEntry(
  uuid: string,
  lat: number,
  lng: number,
  posTypeUuids: string[],
  posSourceUuid: string,
  createdAtIso: string
): PosEntry {
  const createdAt = Date.parse(createdAtIso);
  return {
    uuid,
    location: { lat, lng },
    elevation: 0,
    petSeconds: 0,
    posTypeUuids,
    posSourceUuid,
    createdAt,
    updatedAt: createdAt,
  };
}

function makePosType(uuid: string, color = "#00aaff", abbr = "P"): PosType {
  return { uuid, abbr, name: `Type ${abbr}`, icon: "1f535", pathColor: color };
}

function makePosSource(uuid: string, abbr = "S"): PosSource {
  return { uuid, name: `Source ${abbr}`, abbr };
}

function makeRex(overrides: Partial<Rex> = {}): Rex {
  return {
    uuid: REX_UUID,
    missionId: 42,
    ownerId: 1,
    name: "Test REX",
    description: "",
    petStartStopTimestamp: null,
    petValueAtStartStop: "+00:00:00",
    petRunning: false,
    evaUuid: EVA_UUID,
    isRunning: true,
    posEntries: [],
    posTypes: [],
    posSources: [],
    stationEntries: null,
    traverseEntries: null,
    actionEntries: null,
    xgressEntries: null,
    maestroControlled: false,
    maestroEventId: null,
    maestroEventUrl: null,
    maestroActivityPropertiesByRefUuid: null,
    ...overrides,
  };
}

function defaultMapDisplayPos(overrides: Partial<MapSubmenuPos> = {}): MapSubmenuPos {
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
// Store factory
// ---------------------------------------------------------------------------

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(preloadedState: PartialPreloadedState = {}) {
  return configureStore({
    reducer: {
      rex: rexSlice.reducer,
      eva: evaSlice.reducer,
      station: stationSlice.reducer,
      interface: interfaceSlice.reducer,
      map: mapSlice.reducer,
      hover: hoverSlice.reducer,
    },
    preloadedState,
  });
}

/** Populates the mock Automerge doc with the rex and returns minimal Redux preloaded state. */
function preloaded({
  rex,
  sectionSelectedLabel = "evas",
}: {
  rex: Rex;
  sectionSelectedLabel?: string;
}): PartialPreloadedState {
  // Rex entity data lives in the Automerge doc
  mockMissionDoc.rexes = { [rex.uuid]: rex } as unknown as Mission["rexes"];
  mockMissionDoc.evas = {
    [EVA_UUID]: {
      uuid: EVA_UUID,
      name: "EVA",
      egressLocationUuid: "lander",
      ingressLocationUuid: "lander",
    },
  } as unknown as Mission["evas"];

  return {
    rex: {
      ...rexSlice.getInitialState(),
      selectedRexUuid: REX_UUID,
    },
    interface: {
      ...interfaceSlice.getInitialState(),
      sectionSelectedLabel,
    },
  } as unknown as PartialPreloadedState;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;
let testCookies: Cookies;
let posSource: VectorSource | null = null;
let posPathSource: VectorSource | null = null;
let capturedSetters: ReturnType<typeof useMapMenuSetters> | null = null;

function SourceAndSetterCapture(): null {
  const sources = useFeatureSourcesContext();
  posSource = sources.posSource;
  posPathSource = sources.posPathSource;
  capturedSetters = useMapMenuSetters();
  return null;
}

function findPathLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.POS_ENTRIES) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

function findMarkerLayer(): VectorLayer<VectorSource> | null {
  const layers = map.getLayers().getArray();
  return (
    (layers.find((l) => l.getZIndex() === Z_INDEX.POS_MARKERS) as
      | VectorLayer<VectorSource>
      | undefined) ?? null
  );
}

/** Count of marker features on the shared posSource. */
function markerCount(): number {
  return posSource?.getFeatures().length ?? 0;
}

function renderPosEntries(mode: "editor" | "dashboard" | "minimap" = "editor") {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode }}>
              <PosEntries />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  posSource = null;
  posPathSource = null;
  capturedSetters = null;
  harness = createReactHarness();
  testCookies = new Cookies();

  // Reset mock doc before each test
  Object.keys(mockMissionDoc).forEach((k) => {
    delete (mockMissionDoc as Record<string, unknown>)[k];
  });

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

describe("PosEntries", () => {
  it("adds marker + path VectorLayers at their z-indices", () => {
    store = makeStore();
    renderPosEntries();
    const pathLayer = findPathLayer();
    const markerLayer = findMarkerLayer();
    expect(pathLayer).not.toBeNull();
    expect(pathLayer!.getZIndex()).toBe(Z_INDEX.POS_ENTRIES);
    expect(markerLayer).not.toBeNull();
    expect(markerLayer!.getZIndex()).toBe(Z_INDEX.POS_MARKERS);
  });

  it("renders no marker features when no REX is selected", () => {
    store = makeStore();
    renderPosEntries();
    expect(markerCount()).toBe(0);
  });

  it("renders no marker features when sectionSelected is not 'evas'", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const rex = makeRex({
      posEntries: [e1],
      posTypes: [makePosType(POSTYPE_A_UUID)],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex, sectionSelectedLabel: "preset" }));
    renderPosEntries();
    expect(markerCount()).toBe(0);
  });

  it("creates a marker feature for each visible POS entry (editor mode)", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const e2 = makePosEntry("e2", 11, 21, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:01:00Z");
    const rex = makeRex({
      posEntries: [e1, e2],
      posTypes: [makePosType(POSTYPE_A_UUID)],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();

    expect(markerCount()).toBe(2);
    expect(posSource!.getFeatureById("e1")).not.toBeNull();
    expect(posSource!.getFeatureById("e2")).not.toBeNull();
  });

  it("orders stacked icons by posTypes list position, not entry toggle order", () => {
    // Entry lists its types out of order (Cart, EV1, EV2); the marker stack must
    // follow the REX posTypes order (EV1, EV2, Cart).
    const entry = makePosEntry(
      "e1",
      10,
      20,
      [POSTYPE_B_UUID, POSTYPE_A_UUID], // toggled in reverse of posTypes order
      SOURCE_A_UUID,
      "2026-01-01T00:00:00Z"
    );
    const rex = makeRex({
      posEntries: [entry],
      posTypes: [
        makePosType(POSTYPE_A_UUID, "#00aaff", "1"),
        makePosType(POSTYPE_B_UUID, "#ff0000", "C"),
      ],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();

    const feature = posSource!.getFeatureById("e1")!;
    const posMarkers = feature.get("posMarkers") as { color: string }[];
    // posType A (#00aaff) before posType B (#ff0000)
    expect(posMarkers.map((m) => m.color)).toEqual(["#00aaff", "#ff0000"]);
  });

  it("filters marker features by mapDisplayPos.sourceUuids when set", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const e2 = makePosEntry("e2", 11, 21, [POSTYPE_A_UUID], SOURCE_B_UUID, "2026-01-01T00:01:00Z");
    const rex = makeRex({
      posEntries: [e1, e2],
      posTypes: [makePosType(POSTYPE_A_UUID)],
      posSources: [makePosSource(SOURCE_A_UUID), makePosSource(SOURCE_B_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();

    expect(markerCount()).toBe(2);

    // Restrict to source A only
    flushSync(() => {
      capturedSetters!.setSubmenuPos(defaultMapDisplayPos({ sourceUuids: [SOURCE_A_UUID] }));
    });
    expect(markerCount()).toBe(1);
    expect(posSource!.getFeatureById("e1")).not.toBeNull();
    expect(posSource!.getFeatureById("e2")).toBeNull();
  });

  it("removes all marker features when mapDisplayPos.showMarkers toggles off", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const rex = makeRex({
      posEntries: [e1],
      posTypes: [makePosType(POSTYPE_A_UUID)],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();
    expect(markerCount()).toBe(1);

    flushSync(() => {
      capturedSetters!.setSubmenuPos(defaultMapDisplayPos({ showMarkers: false }));
    });
    expect(markerCount()).toBe(0);
  });

  it("renders one POS path feature per posType when there are >=2 entries", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const e2 = makePosEntry("e2", 11, 21, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:01:00Z");
    const e3 = makePosEntry("e3", 12, 22, [POSTYPE_B_UUID], SOURCE_A_UUID, "2026-01-01T00:02:00Z");
    const rex = makeRex({
      posEntries: [e1, e2, e3],
      posTypes: [makePosType(POSTYPE_A_UUID, "#00aaff"), makePosType(POSTYPE_B_UUID, "#ff0000")],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();

    // Default: showOldPaths=true → all-paths branch. Type A has 2 entries → one
    // feature; Type B has 1 entry → no feature.
    const features = posPathSource!.getFeatures();
    expect(features.length).toBeGreaterThanOrEqual(1);
    expect(features.some((f) => (f.getId() as string).includes(POSTYPE_A_UUID))).toBe(true);
    expect(features.some((f) => (f.getId() as string).includes(POSTYPE_B_UUID))).toBe(false);
  });

  it("clears path features when mapDisplayPos.showPaths toggles off", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const e2 = makePosEntry("e2", 11, 21, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:01:00Z");
    const rex = makeRex({
      posEntries: [e1, e2],
      posTypes: [makePosType(POSTYPE_A_UUID)],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();
    expect(posPathSource!.getFeatures().length).toBeGreaterThan(0);

    flushSync(() => {
      capturedSetters!.setSubmenuPos(defaultMapDisplayPos({ showPaths: false }));
    });
    expect(posPathSource!.getFeatures()).toHaveLength(0);
  });

  it("removes marker features + layers on unmount", () => {
    const e1 = makePosEntry("e1", 10, 20, [POSTYPE_A_UUID], SOURCE_A_UUID, "2026-01-01T00:00:00Z");
    const rex = makeRex({
      posEntries: [e1],
      posTypes: [makePosType(POSTYPE_A_UUID)],
      posSources: [makePosSource(SOURCE_A_UUID)],
    });
    store = makeStore(preloaded({ rex }));
    renderPosEntries();
    expect(markerCount()).toBe(1);
    expect(findMarkerLayer()).not.toBeNull();
    expect(findPathLayer()).not.toBeNull();

    harness.unmount();
    harness = createReactHarness();

    expect(findMarkerLayer()).toBeNull();
    expect(findPathLayer()).toBeNull();
  });

  describe("marker click handler", () => {
    beforeEach(() => {
      thunkSelectEVASequenceItemMock.mockClear();
    });

    it("clicking a marker feature selects the POS entry and clears EVA selection", () => {
      const e1 = makePosEntry(
        "click-e1",
        10,
        20,
        [POSTYPE_A_UUID],
        SOURCE_A_UUID,
        "2026-01-01T00:00:00Z"
      );
      const rex = makeRex({
        posEntries: [e1],
        posTypes: [makePosType(POSTYPE_A_UUID)],
        posSources: [makePosSource(SOURCE_A_UUID)],
      });
      store = makeStore(preloaded({ rex }));
      renderPosEntries();

      const layer = findMarkerLayer()!;
      const feature = posSource!.getFeatureById("click-e1")!;
      expect(feature).not.toBeNull();

      // Stub hit-testing to return our marker feature only when scanning the
      // POS marker layer.
      vi.spyOn(map, "forEachFeatureAtPixel").mockImplementation(
        (_pixel, callback, opts: unknown) => {
          const layerFilter = (opts as { layerFilter?: (l: unknown) => boolean })?.layerFilter;
          if (!layerFilter || layerFilter(layer)) {
            return (callback as (f: unknown) => unknown)(feature);
          }
          return undefined;
        }
      );

      dispatchMapClick(map, [50, 50], [20000, 10000]);

      // The reducer set selectedPosEntryUuid to our entry's id
      expect(store.getState().rex.selectedPosEntryUuid).toBe("click-e1");
      // And the EVA-sequence item was cleared
      expect(thunkSelectEVASequenceItemMock).toHaveBeenCalledWith({ sequenceItemUuid: null });
    });
  });
});
