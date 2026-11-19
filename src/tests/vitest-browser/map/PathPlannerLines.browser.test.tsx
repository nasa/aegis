/* eslint-disable react-hooks/globals -- Probe components intentionally write
 *  to outer-scope variables so test assertions can read what the hook returned. */

/**
 * Browser-mode tests for `PathPlannerLines`: the selected plan's straight line on the shared
 * `pathPlannerSource`, its Newton path on the component's own layer (dimmed when stale), and
 * the edit-drag rule that leaves geometry to Modify while editing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type { LineString } from "ol/geom";

import { MapContext } from "components/interface/map/MapProvider";
import {
  FeatureSourcesProvider,
  useFeatureSourcesContext,
} from "components/interface/map/FeatureSourcesProvider";
import { PathPlannerLines } from "components/interface/map/behaviors/PathPlannerLines";
import { pathPlannerSlice } from "store/pathPlanner";
import { mapSlice } from "store/map";
import { newtonInputSignature } from "utils/newtonInputs";
import type * as UseDocSelectorModule from "utils/useDocSelector";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => ({
  useCoordConverters: () => ({
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  }),
}));

vi.mock("utils/useDocSelector", async (importOriginal) => {
  const actual = await importOriginal<typeof UseDocSelectorModule>();
  return {
    ...actual,
    useMissionDocSelector: (selector: (m: { planetRadius: number }) => unknown) =>
      selector({ planetRadius: 1737400 }),
  };
});

const START = { lat: 5, lng: 6 };
const GOAL = { lat: 7, lng: 8 };
const MID = { lat: 6, lng: 6.5 };

function makePlan(uuid: string, withPath: "current" | "stale" | "none" = "none"): PathPlan {
  const signature = newtonInputSignature("moon", [START, GOAL], {});
  const result =
    withPath === "none"
      ? null
      : ({
          traverseId: "t1",
          inputSignature: withPath === "current" ? signature : "older",
          status: "succeeded",
          path: [START, MID, GOAL],
        } as PathPlanResult);
  return {
    uuid,
    createdAt: "2026-11-02T00:00:00Z",
    color: "#ff8c42",
    points: [START, GOAL],
    pointsTouched: withPath !== "none",
    params: {},
    request: {
      status: withPath === "current" ? "ready" : "debouncing",
      inputSignature: withPath === "current" ? signature : null,
      traverseId: withPath === "current" ? "t1" : null,
      result,
      pathResult: result,
      error: null,
    },
  };
}

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore(plans: PathPlan[], selectedPlanUuid: string | null) {
  return configureStore({
    reducer: { pathPlanner: pathPlannerSlice.reducer, map: mapSlice.reducer },
    preloadedState: { pathPlanner: { plans, selectedPlanUuid } } as PartialPreloadedState,
  });
}

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;
let pathPlannerSource: VectorSource | null = null;

function SourceCapture(): null {
  pathPlannerSource = useFeatureSourcesContext().pathPlannerSource;
  return null;
}

function newtonSource(): VectorSource {
  const layer = map
    .getLayers()
    .getArray()
    .find(
      (l) => (l as VectorLayer<VectorSource>).getSource() !== pathPlannerSource
    ) as VectorLayer<VectorSource>;
  return layer.getSource();
}

function render() {
  harness.render(
    <Provider store={store}>
      <FeatureSourcesProvider>
        <SourceCapture />
        <MapContext.Provider value={{ map, mode: "editor" }}>
          <PathPlannerLines />
        </MapContext.Provider>
      </FeatureSourcesProvider>
    </Provider>
  );
}

beforeEach(() => {
  pathPlannerSource = null;
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
});

afterEach(() => {
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

describe("PathPlannerLines", () => {
  it("adds two layers and removes them on unmount", () => {
    store = makeStore([], null);
    render();
    expect(map.getLayers().getLength()).toBe(2);
    harness.unmount();
    harness = createReactHarness();
    expect(map.getLayers().getLength()).toBe(0);
  });

  it("draws only the selected plan's straight line", () => {
    store = makeStore([makePlan("a"), makePlan("b")], "b");
    render();
    const features = pathPlannerSource!.getFeatures();
    expect(features).toHaveLength(1);
    expect(features[0].getId()).toBe("b");
    expect(features[0].get("mapItemType")).toBe("pathPlan");
    expect((features[0].getGeometry() as LineString).getCoordinates()).toEqual([
      [6000, 5000],
      [8000, 7000],
    ]);
    expect(newtonSource().getFeatures()).toHaveLength(0);
  });

  it("draws the Newton path, current or stale", () => {
    store = makeStore([makePlan("a", "current")], "a");
    render();
    let [path] = newtonSource().getFeatures();
    expect(path.getId()).toBe("newton-a");
    expect(path.get("current")).toBe(true);
    expect((path.getGeometry() as LineString).getCoordinates()).toHaveLength(3);

    flushSync(() => {
      store.dispatch(
        pathPlannerSlice.actions.setPathPlanInputs({
          uuid: "a",
          points: [START, { lat: 7, lng: 9 }],
        })
      );
    });
    [path] = newtonSource().getFeatures();
    expect(path.get("current")).toBe(false);
  });

  it("keeps the old path, greyed out, while new points are planned or fail", () => {
    store = makeStore([makePlan("a", "current")], "a");
    render();
    const moved = { lat: 7, lng: 9 };
    const newSignature = newtonInputSignature("moon", [START, moved], {});
    const { actions } = pathPlannerSlice;
    flushSync(() => {
      store.dispatch(actions.setPathPlanInputs({ uuid: "a", points: [START, moved] }));
      store.dispatch(actions.pathPlanRequestStarted({ uuid: "a", inputSignature: newSignature }));
      store.dispatch(
        actions.pathPlanSubmitted({ uuid: "a", inputSignature: newSignature, traverseId: "t2" })
      );
      // Newton's job for the new points is waiting for a slot, with no path yet.
      store.dispatch(
        actions.pathPlanResultReceived({
          uuid: "a",
          result: {
            traverseId: "t2",
            inputSignature: newSignature,
            status: "pending",
            path: null,
          } as PathPlanResult,
        })
      );
    });
    let [path] = newtonSource().getFeatures();
    expect(path.get("current")).toBe(false);
    expect((path.getGeometry() as LineString).getCoordinates()).toHaveLength(3);

    // A failed plan for the new points leaves the old path in place.
    flushSync(() => {
      store.dispatch(
        actions.pathPlanResultReceived({
          uuid: "a",
          result: {
            traverseId: "t2",
            inputSignature: newSignature,
            status: "failed",
            path: null,
          } as PathPlanResult,
        })
      );
    });
    [path] = newtonSource().getFeatures();
    expect(path.get("current")).toBe(false);

    // The new path replaces it.
    flushSync(() => {
      store.dispatch(actions.pathPlanRequestStarted({ uuid: "a", inputSignature: newSignature }));
      store.dispatch(
        actions.pathPlanSubmitted({ uuid: "a", inputSignature: newSignature, traverseId: "t3" })
      );
      store.dispatch(
        actions.pathPlanResultReceived({
          uuid: "a",
          result: {
            traverseId: "t3",
            inputSignature: newSignature,
            status: "succeeded",
            path: [START, moved],
          } as PathPlanResult,
        })
      );
    });
    [path] = newtonSource().getFeatures();
    expect(path.get("current")).toBe(true);
    expect((path.getGeometry() as LineString).getCoordinates()).toHaveLength(2);
  });

  it("keeps Modify's geometry while the plan is being edited", () => {
    store = makeStore([makePlan("a")], "a");
    render();
    flushSync(() => {
      store.dispatch(
        mapSlice.actions.updateMapDirective({
          uuid: "a",
          mapItemType: "pathPlan",
          mapAction: "editPolyline",
        })
      );
    });
    const feature = pathPlannerSource!.getFeatureById("a");
    const geometry = feature.getGeometry();
    flushSync(() => {
      store.dispatch(
        pathPlannerSlice.actions.setPathPlanInputs({
          uuid: "a",
          points: [START, { lat: 7, lng: 9 }],
        })
      );
    });
    expect(pathPlannerSource!.getFeatureById("a").getGeometry()).toBe(geometry);
  });

  it("clears the features when the selection is cleared", () => {
    store = makeStore([makePlan("a", "current")], "a");
    render();
    flushSync(() => {
      store.dispatch(pathPlannerSlice.actions.setSelectedPathPlanUuid(null));
    });
    expect(pathPlannerSource!.getFeatures()).toHaveLength(0);
    expect(newtonSource().getFeatures()).toHaveLength(0);
  });
});
