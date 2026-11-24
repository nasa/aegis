/* eslint-disable react-hooks/globals -- The probe component intentionally writes
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Regression tests for the OpenLayers marker-label flicker during a running REX.
 *
 * A running REX relabels every crew position once a second ("04m17s ago / EV1
 * (T)") and `useRexPetTime` ticks at 100 ms, so `runLayout` re-runs ten times a
 * second. Two defects fell out of that:
 *
 *  1. Every label on the map was rewritten on each pass — `setCoordinates` and
 *     a freshly allocated `anchorCoord` array both fire an OL change event on
 *     identity alone — so static station/POI labels repainted at 10 Hz.
 *  2. Each new position text added a canvas to an unbounded style cache, and an
 *     entry to OL's global 1024-slot icon-image cache keyed off it, which then
 *     evicted the labels still on screen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import type { Icon, Style } from "ol/style";
import { flushSync } from "react-dom";
import type VectorSource from "ol/source/Vector";
import { CookiesProvider, Cookies } from "react-cookie";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { MapMenuProvider, useMapMenuSetters } from "components/interface/map/MapMenuProvider";
import { MarkerLabels } from "components/interface/map/behaviors/MarkerLabels";
import { createMarkerLabelStyle } from "components/interface/map/utils/styles/markerLabels";
import { assetSlice } from "store/asset";
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
    // Returns a new array per call, like the real proj4-backed converter.
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

const REX_UUID = "rex-1";
const STATION_UUID = "station-a";

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
      asset: assetSlice.reducer,
    },
    preloadedState,
  });
}

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

function renderMarkerLabels() {
  harness.render(
    <CookiesProvider cookies={testCookies}>
      <Provider store={store}>
        <FeatureSourcesProvider>
          <MapMenuProvider>
            <SourceAndSetterCapture />
            <MapContext.Provider value={{ map, mode: "dashboard" }}>
              <MarkerLabels />
            </MapContext.Provider>
          </MapMenuProvider>
        </FeatureSourcesProvider>
      </Provider>
    </CookiesProvider>
  );
}

beforeEach(() => {
  mockMissionDoc.folders = {};
  mockMissionDoc.landerLocation = null;
  mockMissionDoc.stations = undefined;
  mockMissionDoc.rexes = undefined;
  labelSource = null;
  capturedSetters = null;
  harness = createReactHarness();
  testCookies = new Cookies();

  mapContainer = document.createElement("div");
  mapContainer.style.width = "600px";
  mapContainer.style.height = "400px";
  document.body.appendChild(mapContainer);

  map = new Map({
    target: mapContainer,
    controls: [],
    view: new View({ projection: "EPSG:3857", center: [0, 0], resolution: 1 }),
  });
  map.updateSize();
  map.renderSync();
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

/** A station label plus a crew position label on a REX whose PET is ticking. */
function setupRunningRexWithStationLabel() {
  mockMissionDoc.stations = {
    [STATION_UUID]: {
      uuid: STATION_UUID,
      name: "Station Alpha",
      icon: "1f535",
      location: { lat: 0, lng: 0 },
      mapCircleControls: {},
      refUuid: null,
    },
  } as unknown as Mission["stations"];

  mockMissionDoc.rexes = {
    [REX_UUID]: {
      uuid: REX_UUID,
      isRunning: true,
      petRunning: true,
      petStartStopTimestamp: new Date().toISOString(),
      petValueAtStartStop: "+00:00:00",
      evaUuid: "eva-1",
      posEntries: [
        {
          uuid: "pos-1",
          location: { lat: 0.05, lng: 0.05 },
          petSeconds: 0,
          posTypeUuids: ["ev1"],
          posSourceUuid: "task",
          createdAt: 1,
        },
      ],
      posTypes: [{ uuid: "ev1", abbr: "EV1" }],
      posSources: [{ uuid: "task", abbr: "T" }],
    } as unknown as Rex,
  } as unknown as Mission["rexes"];

  store = makeStore({
    interface: { ...interfaceSlice.getInitialState(), sectionSelectedLabel: "evas" },
    rex: { ...rexSlice.getInitialState(), selectedRexUuid: REX_UUID },
  } as PartialPreloadedState);

  renderMarkerLabels();

  flushSync(() => {
    capturedSetters!.setSubmenuStations({
      show: true,
      showLabels: true,
      showWalkbacks: false,
      showCircles: false,
    });
    capturedSetters!.setSubmenuPos((previous) => ({
      ...previous,
      show: true,
      showLatestLabels: true,
      sourceUuids: [],
    }));
  });
}

describe("MarkerLabels flicker during a running REX", () => {
  it("leaves a static station label untouched while PET ticks", async () => {
    setupRunningRexWithStationLabel();

    const station = labelSource!.getFeatureById(`station-${STATION_UUID}`)!;
    expect(station).not.toBeNull();

    // `change` covers geometry rewrites; `propertychange` covers the
    // name/anchorCoord/opacity writes. Neither should happen for a label whose
    // own data is unchanged.
    let stationChanges = 0;
    station.on("change", () => stationChanges++);
    station.on("propertychange", () => stationChanges++);

    // Long enough for ~20 PET ticks and at least one position-age relabel.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(labelSource!.getFeatureById("pos-pos-1")!.get("name")).toContain("ago");
    expect(stationChanges).toBe(0);
  }, 20000);

  it("still repaints a label whose own text changes", async () => {
    setupRunningRexWithStationLabel();

    const posLabel = labelSource!.getFeatureById("pos-pos-1")!;
    const firstText = posLabel.get("name") as string;

    let nameChanges = 0;
    posLabel.on("propertychange", (event) => {
      if ((event as unknown as { key: string }).key === "name") nameChanges++;
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(posLabel.get("name")).not.toBe(firstText);
    expect(nameChanges).toBeGreaterThan(0);
  }, 20000);
});

describe("marker label canvas cache", () => {
  function asArray(style: Style | Style[] | undefined): Style[] {
    if (!style) return [];
    return Array.isArray(style) ? style : [style];
  }

  function posLabelFeature(name: string): Feature {
    const feature = new Feature(new Point([0, 0]));
    feature.set("name", name);
    feature.set("labelType", "pos");
    return feature;
  }

  function ageText(second: number): string {
    const minutes = String(Math.floor(second / 60)).padStart(2, "0");
    const seconds = String(second % 60).padStart(2, "0");
    return `${minutes}m${seconds}s ago / EV1 (T)`;
  }

  function canvasFor(styleFn: ReturnType<typeof createMarkerLabelStyle>, text: string) {
    const style = asArray(styleFn(posLabelFeature(text), 1))[0];
    return (style.getImage() as Icon).getImage(1) as HTMLCanvasElement;
  }

  it("evicts stale position-age canvases instead of retaining every tick", () => {
    const styleFn = createMarkerLabelStyle(14, 1.5);

    const firstCanvas = canvasFor(styleFn, ageText(0));

    // An hour of once-a-second relabelling of a single crew position.
    // Unbounded, this retained 3,600 canvases (~57 MB for one label).
    for (let second = 1; second < 3600; second++) canvasFor(styleFn, ageText(second));

    // The long-expired text is no longer held, so it has to be re-rendered.
    expect(canvasFor(styleFn, ageText(0))).not.toBe(firstCanvas);
  });

  it("keeps recently drawn labels cached so on-screen labels are not re-rendered", () => {
    const styleFn = createMarkerLabelStyle(14, 1.5);

    for (let second = 0; second < 3600; second++) canvasFor(styleFn, ageText(second));

    // The labels currently on screen are the most recent ones, and they are
    // re-requested every frame — they must survive eviction.
    const recent = ageText(3599);
    expect(canvasFor(styleFn, recent)).toBe(canvasFor(styleFn, recent));
  });

  it("still reuses the canvas for an unchanged label", () => {
    const styleFn = createMarkerLabelStyle(14, 1.5);
    const first = asArray(styleFn(posLabelFeature("05s ago / EV1 (T)"), 1))[0];
    const second = asArray(styleFn(posLabelFeature("05s ago / EV1 (T)"), 1))[0];

    expect((first.getImage() as Icon).getImage(1)).toBe((second.getImage() as Icon).getImage(1));
  });
});
