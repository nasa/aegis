/**
 * Browser-mode drag test for Newton Path Planner points: mounts `PathPlannerLines` and
 * `InteractionManager` with the real path-planner thunks and drags the goal pin with real
 * pointer events, as a user would in Edit Points on Map.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { flushSync } from "react-dom";
import Map from "ol/Map";
import View from "ol/View";

import { MapContext } from "components/interface/map/MapProvider";
import { FeatureSourcesProvider } from "components/interface/map/FeatureSourcesProvider";
import { PathPlannerLines } from "components/interface/map/behaviors/PathPlannerLines";
import { InteractionManager } from "components/interface/map/behaviors/InteractionManager";
import { pathPlannerSlice } from "store/pathPlanner";
import { mapSlice, updateMapDirective } from "store/map";
import { interfaceSlice } from "store/interface";
import { measureSlice } from "store/measure";
import { assetSlice } from "store/asset";
import { poiSlice } from "store/poi";
import { stationSlice } from "store/station";
import { evaSlice } from "store/eva";
import { traverseSlice } from "store/traverse";
import { stopPathPlanner } from "store/thunk/thunkPathPlanner";
import type * as UseDocSelectorModule from "utils/useDocSelector";
import { createReactHarness, type ReactHarness } from "./helpers/reactBrowserHarness";

vi.mock("components/interface/map/hooks/useCoordConverters", () => {
  const converters = {
    toMapCoord: (point: { lat: number; lng: number }) => [point.lng * 1000, point.lat * 1000],
    toAegisPoint: ([x, y]: number[]) => ({ lat: y / 1000, lng: x / 1000 }),
    projCode: "EPSG:3857",
  };
  return { useCoordConverters: () => converters, createCoordConverters: () => converters };
});

vi.mock("utils/useDocSelector", async (importOriginal) => {
  const actual = await importOriginal<typeof UseDocSelectorModule>();
  return {
    ...actual,
    useMissionDocSelector: (selector: (m: Partial<Mission>) => unknown) =>
      selector({ planetRadius: 1737400, usingLGRSCoordinates: false }),
  };
});

vi.mock("http-client/newton");

const PLAN: PathPlan = {
  uuid: "plan-1",
  createdAt: "2026-11-02T00:00:00Z",
  color: "#ff8c42",
  // Map coords [-100, 0] and [100, 0]: 100 px either side of the centre at resolution 1.
  start: { lat: 0, lng: -0.1 },
  goal: { lat: 0, lng: 0.1 },
  pointsTouched: false,
  params: {},
  request: { status: "idle", inputSignature: null, row: null, error: null },
};

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore() {
  return configureStore({
    reducer: {
      pathPlanner: pathPlannerSlice.reducer,
      map: mapSlice.reducer,
      interface: interfaceSlice.reducer,
      measure: measureSlice.reducer,
      asset: assetSlice.reducer,
      poi: poiSlice.reducer,
      station: stationSlice.reducer,
      eva: evaSlice.reducer,
      traverse: traverseSlice.reducer,
    },
    preloadedState: {
      pathPlanner: { plans: [PLAN], selectedPlanUuid: PLAN.uuid },
      interface: { ...interfaceSlice.getInitialState(), bottomSectionSelectedLabel: "pathPlanner" },
    } as PartialPreloadedState,
  });
}

let harness: ReactHarness;
let map: Map;
let mapContainer: HTMLDivElement;
let store: ReturnType<typeof makeStore>;

/** Sends a pointer event at a pixel offset from the map's top-left corner. */
function pointer(type: string, x: number, y: number, buttons: number) {
  const viewport = map.getViewport();
  const rect = viewport.getBoundingClientRect();
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + x,
    clientY: rect.top + y,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons,
  };
  const target = type === "pointerdown" ? viewport : document;
  target.dispatchEvent(new PointerEvent(type, init));
}

beforeEach(() => {
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
  store = makeStore();
  harness.render(
    <Provider store={store}>
      <FeatureSourcesProvider>
        <MapContext.Provider value={{ map, mode: "editor" }}>
          <PathPlannerLines />
          <InteractionManager />
        </MapContext.Provider>
      </FeatureSourcesProvider>
    </Provider>
  );
  map.renderSync();
});

afterEach(() => {
  stopPathPlanner();
  harness.unmount();
  map.setTarget(undefined);
  map.dispose();
  mapContainer.remove();
});

describe("Newton Path Planner point editing", () => {
  it("dragging the goal pin moves the plan's goal", async () => {
    flushSync(() => {
      store.dispatch(
        updateMapDirective({ uuid: PLAN.uuid, mapItemType: "pathPlan", mapAction: "editPolyline" })
      );
    });
    map.renderSync();

    // The goal pin sits at pixel (300, 150).
    pointer("pointermove", 300, 150, 0);
    pointer("pointerdown", 300, 150, 1);
    for (let step = 1; step <= 5; step++) pointer("pointermove", 300, 150 - step * 10, 1);
    pointer("pointerup", 300, 100, 0);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const plan = store.getState().pathPlanner.plans[0];
    expect(plan.pointsTouched).toBe(true);
    expect(plan.start).toEqual(PLAN.start);
    expect(plan.goal.lng).toBeCloseTo(0.1, 6);
    expect(plan.goal.lat).toBeCloseTo(0.05, 6);
    expect(store.getState().map.mapDirective?.mapAction).toBe("editPolyline");
  });
});
