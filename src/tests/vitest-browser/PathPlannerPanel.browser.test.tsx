/**
 * Browser-mode tests for the Newton Path Planner panel: start/goal coordinates, the slope
 * limit field's default, the slope limit of the path shown, and Finished sending at once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { page, userEvent } from "vitest/browser";

import PathPlanner from "components/interface/pathPlanner/path-planner";
import { pathPlannerSlice } from "store/pathPlanner";
import { mapSlice, updateMapDirective } from "store/map";
import {
  NEWTON_TOOL_DEBOUNCE_MS,
  stopPathPlanner,
  thunkAddPathPlan,
  thunkUpdatePathPlanPoints,
} from "store/thunk/thunkPathPlanner";
import { formatLgrsFromLatLon, LGRS_DISPLAY_PRECISION_METERS } from "utils/lgrs/display";
import { newtonInputSignature } from "utils/newtonInputs";
import { createReactHarness, type ReactHarness } from "./map/helpers/reactBrowserHarness";

const mission = {
  id: 7,
  planetRadius: 1737400,
  gridRenderMode: "dynamic-lgrs",
  landerLocation: { lat: -89.5, lng: 10 },
} as Partial<Mission>;

vi.mock("utils/useDocSelector", () => ({
  useMissionDocSelector: (selector: (m: Partial<Mission>) => unknown) => selector(mission),
}));
const missionHandle = { doc: () => mission };
vi.mock("client/automergeDocHandles", () => ({
  getMissionDocHandle: () => missionHandle,
}));
const { postNewtonTraverse } = vi.hoisted(() => ({
  postNewtonTraverse: vi.fn<(data: NewtonTraversePostData) => Promise<NewtonTraverseResponse>>(),
}));
vi.mock("http-client/newton", () => ({
  postNewtonTraverse,
  newtonPollDelayMs: () => 2_000,
  isNewtonTraverseFinished: (row: NewtonTraverseRow) =>
    row.status === "succeeded" || row.status === "failed" || row.status === "cancelled",
}));

const START = { lat: -89.5, lng: 10 };
const GOAL = { lat: -89.51, lng: 10.2 };

type PartialPreloadedState = Parameters<typeof configureStore>[0]["preloadedState"];

function makeStore() {
  return configureStore({
    reducer: { pathPlanner: pathPlannerSlice.reducer, map: mapSlice.reducer },
    preloadedState: {
      map: { ...mapSlice.getInitialState(), measureInitialCoords: [START, START] },
    } as PartialPreloadedState,
  });
}

let harness: ReactHarness;
let store: ReturnType<typeof makeStore>;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(postNewtonTraverse).mockImplementation(async ({ waypoints, params }) => ({
    status: "success",
    message: "ok",
    data: {
      uuid: "row-1",
      inputSignature: newtonInputSignature("moon", waypoints, params ?? {}),
      status: "succeeded",
      waypoints,
      params,
      path: waypoints,
      segmentDistances: [1200],
    } as NewtonTraverseRow,
  }));
  harness = createReactHarness();
  store = makeStore();
  await store.dispatch(thunkAddPathPlan());
  harness.render(
    <Provider store={store}>
      <PathPlanner />
    </Provider>
  );
});

afterEach(() => {
  stopPathPlanner();
  harness.unmount();
});

const plan = () => store.getState().pathPlanner.plans[0];
const textOf = (testId: string) =>
  harness.container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";

describe("PathPlanner panel", () => {
  it("shows the default slope limit, 20°, in the field", async () => {
    await expect.element(page.getByLabelText("Slope limit (degrees)")).toHaveValue("20");
    expect(plan().params.slopeLimit).toBe(20);
  });

  it("lists the start and goal in lat/lng and LGRS", async () => {
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid: plan().uuid, path: [START, GOAL] }));
    const lgrs = formatLgrsFromLatLon(GOAL, LGRS_DISPLAY_PRECISION_METERS, "full");
    expect(lgrs).toBeTruthy();
    await vi.waitFor(() => {
      expect(textOf("path-plan-point-goal")).toBe(`Goal-89.510000, 10.200000LGRS ${lgrs}`);
    });
    expect(textOf("path-plan-point-start")).toMatch(/^Start-89\.500000, 10\.000000LGRS /);
  });

  it("Finished sends the new points at once, then shows the path's slope limit", async () => {
    const { uuid } = plan();
    store.dispatch(
      updateMapDirective({ uuid, mapItemType: "pathPlan", mapAction: "editPolyline" })
    );
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, GOAL] }));
    expect(plan().request.status).toBe("debouncing");

    const sentAt = Date.now();
    await page.getByText("Finished", { exact: true }).click();
    await vi.waitFor(() => expect(postNewtonTraverse).toHaveBeenCalledTimes(1));
    expect(Date.now() - sentAt).toBeLessThan(NEWTON_TOOL_DEBOUNCE_MS);
    expect(vi.mocked(postNewtonTraverse).mock.calls[0][0].waypoints[1]).toEqual(GOAL);
    await vi.waitFor(() => expect(plan().request.status).toBe("ready"));

    await vi.waitFor(() => expect(textOf("path-plan-slope-limit")).toBe("Path slope limit20°"));

    // A new limit is debouncing: the row still names the limit of the path shown.
    const field = page.getByLabelText("Slope limit (degrees)");
    await userEvent.clear(field);
    await userEvent.type(field, "15{Enter}");
    expect(plan().params.slopeLimit).toBe(15);
    await vi.waitFor(() =>
      expect(textOf("path-plan-slope-limit")).toBe("Path slope limit20° (older path)")
    );
  });

  it("an emptied slope limit field goes back to the default", async () => {
    const field = page.getByLabelText("Slope limit (degrees)");
    await userEvent.clear(field);
    await userEvent.type(field, "15{Enter}");
    expect(plan().params.slopeLimit).toBe(15);
    await userEvent.clear(field);
    await userEvent.keyboard("{Enter}");
    await expect.element(field).toHaveValue("20");
    expect(plan().params.slopeLimit).toBe(20);
  });
});
