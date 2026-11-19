/**
 * Browser-mode tests for the Newton Path Planner panel: start/midpoint/goal coordinates, the slope
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
  thunkFlushPathPlan,
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
const newton = vi.hoisted(() => ({
  postNewtonTraverses:
    vi.fn<
      (
        missionId: number,
        traverses: NewtonTraversePostData[]
      ) => Promise<NewtonTraverseSubmitResponse[]>
    >(),
  getNewtonTraverses:
    vi.fn<(missionId: number, ids: string[]) => Promise<NewtonTraverseResultResponse[]>>(),
  deleteNewtonTraverse: vi.fn(async () => ({ status: "success" as const, message: "ok" })),
  /** What Newton's job reports when polled. */
  jobStatus: "succeeded" as NewtonTraverseStatus,
}));
vi.mock("http-client/newton", () => ({
  postNewtonTraverses: newton.postNewtonTraverses,
  getNewtonTraverses: newton.getNewtonTraverses,
  deleteNewtonTraverse: newton.deleteNewtonTraverse,
  newtonPollDelayMs: () => 2_000,
  isNewtonTraverseFinished: ({ status }: Pick<NewtonTraverseResult, "status">) =>
    status === "succeeded" || status === "failed" || status === "cancelled",
}));
const { postNewtonTraverses } = newton;

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
  newton.jobStatus = "succeeded";
  const sent = new Map<string, NewtonTraversePostData>();
  newton.postNewtonTraverses.mockImplementation(async (_missionId, traverses) =>
    traverses.map(({ waypoints, params }) => {
      const traverseId = `t${sent.size + 1}`;
      sent.set(traverseId, { waypoints, params });
      return {
        status: "success",
        message: "ok",
        data: {
          traverseId,
          inputSignature: newtonInputSignature("moon", waypoints, params ?? {}),
          requestHash: null as string | null,
          reuse: "new",
        },
      };
    })
  );
  newton.getNewtonTraverses.mockImplementation(async (_missionId, ids) =>
    ids.map((traverseId) => {
      const { waypoints, params } = sent.get(traverseId);
      const succeeded = newton.jobStatus === "succeeded";
      return {
        status: "success",
        message: "ok",
        data: {
          traverseId,
          status: newton.jobStatus,
          waypoints,
          params,
          path: succeeded ? waypoints : null,
          segmentDistances: succeeded ? [1200] : null,
        } as NewtonTraverseResult,
      };
    })
  );
  harness = createReactHarness();
  // The bottom panel's width on a typical screen.
  harness.container.style.width = "1200px";
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

  it("shows the points on the left and the path details beside them", async () => {
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid: plan().uuid, path: [START, GOAL] }));
    await vi.waitFor(() => expect(plan().request.status).toBe("debouncing"));
    const points = harness.container.querySelector('[data-testid="path-plan-points"]');
    const details = harness.container.querySelector('[data-testid="path-plan-details"]');
    expect(points.querySelector('[data-testid="path-plan-point-goal"]')).not.toBeNull();
    expect(details.textContent).toMatch(/^Straight line/);
    const pointsBox = points.getBoundingClientRect();
    const detailsBox = details.getBoundingClientRect();
    expect(detailsBox.left).toBeGreaterThanOrEqual(pointsBox.right);
    expect(detailsBox.top).toBe(pointsBox.top);
  });

  it("lists each midpoint between the start and goal", async () => {
    const mid = { lat: -89.505, lng: 10.1 };
    await store.dispatch(
      thunkUpdatePathPlanPoints({ uuid: plan().uuid, path: [START, mid, GOAL] })
    );
    await vi.waitFor(() => {
      expect(textOf("path-plan-point-midpoint-1")).toMatch(
        /^Midpoint 1-89\.505000, 10\.100000LGRS /
      );
    });
    const labels = [...harness.container.querySelectorAll('[data-testid^="path-plan-point-"]')].map(
      (row) => row.getAttribute("data-testid")
    );
    expect(labels).toEqual([
      "path-plan-point-start",
      "path-plan-point-midpoint-1",
      "path-plan-point-goal",
    ]);
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
    await vi.waitFor(() => expect(postNewtonTraverses).toHaveBeenCalledTimes(1));
    expect(Date.now() - sentAt).toBeLessThan(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses.mock.calls[0][1][0].waypoints[1]).toEqual(GOAL);
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
    expect(textOf("path-plan-length")).toBe("A* path1,200 m (older path)");
  });

  it.each([
    ["pending", "Waiting for Newton…"],
    ["in_progress", "Planning…"],
  ] as const)("shows a spinner while Newton's job is %s", async (jobStatus, label) => {
    newton.jobStatus = jobStatus;
    const { uuid } = plan();
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, GOAL] }));
    // Not awaited: the request keeps polling until the job finishes.
    store.dispatch(thunkFlushPathPlan({ uuid }));
    await vi.waitFor(() => expect(textOf("path-plan-status")).toBe(label));
    const spinner = harness.container.querySelector('[data-testid="path-plan-spinner"]');
    expect(spinner).not.toBeNull();
    expect(getComputedStyle(spinner).animationName).not.toBe("none");

    newton.jobStatus = "succeeded";
    await vi.waitFor(() => expect(textOf("path-plan-status")).toBe("Ready"), { timeout: 5_000 });
    expect(harness.container.querySelector('[data-testid="path-plan-spinner"]')).toBeNull();
  });

  it("shows no spinner while debouncing or failed", async () => {
    const { uuid } = plan();
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, GOAL] }));
    await vi.waitFor(() => expect(textOf("path-plan-status")).toBe("Waiting…"));
    expect(harness.container.querySelector('[data-testid="path-plan-spinner"]')).toBeNull();

    newton.postNewtonTraverses.mockResolvedValueOnce([
      { status: "error", message: "Outside the map", httpStatus: 400 },
    ]);
    await store.dispatch(thunkFlushPathPlan({ uuid }));
    await vi.waitFor(() => expect(textOf("path-plan-status")).toBe("Outside the map"));
    expect(harness.container.querySelector('[data-testid="path-plan-spinner"]')).toBeNull();
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
