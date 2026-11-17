vi.mock("http-client/newton");
import { postNewtonTraverse } from "http-client/newton";
import { createCustomTestStore } from "../../fixtures/store";
import { initialState as pathPlannerInitialState } from "store/pathPlanner";
import { initialState as mapInitialState } from "store/map";
import {
  NEWTON_DEFAULT_SLOPE_LIMIT,
  NEWTON_TOOL_DEBOUNCE_MS,
  stopPathPlanner,
  thunkAddPathPlan,
  thunkFlushPathPlan,
  thunkRemovePathPlan,
  thunkRetryPathPlan,
  thunkUpdatePathPlanParams,
  thunkUpdatePathPlanPoints,
} from "store/thunk/thunkPathPlanner";
import { thunkObliterateMissionSpecificData } from "store/thunk/crossThunk";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { newtonInputSignature } from "utils/newtonInputs";

const START = { lat: 1, lng: 2 };
/** The starting goal from `measureInitialCoords`; never sent. */
const INITIAL_GOAL = { lat: 1, lng: 2.009 };
const GOAL = { lat: 1, lng: 2.01 };
const DEFAULT_PARAMS = { slopeLimit: 20 };
const signatureFor = (
  start: AEGISPoint,
  goal: AEGISPoint,
  params: NewtonTraverseParams = DEFAULT_PARAMS
) => newtonInputSignature("moon", [start, goal], params);

function row(
  status: NewtonTraverseStatus,
  inputSignature: string,
  overrides: Partial<NewtonTraverseRow> = {}
): NewtonTraverseRow {
  return {
    uuid: "row",
    inputSignature,
    status,
    waypoints: [START, GOAL],
    params: {},
    requestHash: null,
    path: status === "succeeded" ? [START, { lat: 1.001, lng: 2.005 }, GOAL] : null,
    segmentDistances: status === "succeeded" ? [100, 200] : null,
    rawVertexCount: null,
    mapInfo: null,
    runtimeMs: null,
    error: null,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

/** Answers every POST with a row for the request's own signature. */
function answerWith(status: NewtonTraverseStatus, overrides: Partial<NewtonTraverseRow> = {}) {
  vi.mocked(postNewtonTraverse).mockImplementation(async ({ waypoints, params }) => ({
    status: "success",
    message: "ok",
    data: row(status, newtonInputSignature("moon", waypoints, params ?? {}), overrides),
  }));
}

function storeWithPoints() {
  return createCustomTestStore({
    map: { ...mapInitialState, measureInitialCoords: [START, INITIAL_GOAL] },
    pathPlanner: { ...pathPlannerInitialState },
  });
}

const onlyPlan = (store: ReturnType<typeof createCustomTestStore>) =>
  store.getState().pathPlanner.plans[0];

/** Adds a plan and drags its goal to GOAL, as a user would before planning starts. */
async function addTouchedPlan(store: ReturnType<typeof createCustomTestStore>) {
  await store.dispatch(thunkAddPathPlan());
  const { uuid } = store.getState().pathPlanner.plans.at(-1);
  await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, GOAL] }));
  return uuid;
}

beforeAll(() => setMissionAutomergeDocHandle(null));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  stopPathPlanner();
  vi.useRealTimers();
});

describe("Newton Path Planner thunks", () => {
  test("a new plan sends nothing until S or G is moved", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    await store.dispatch(thunkAddPathPlan());

    const plan = onlyPlan(store);
    expect(plan.points).toEqual([START, INITIAL_GOAL]);
    expect(plan.pointsTouched).toBe(false);
    expect(plan.params).toEqual({ slopeLimit: 20 });
    expect(plan.request.status).toBe("idle");
    expect(store.getState().pathPlanner.selectedPlanUuid).toBe(plan.uuid);

    await store.dispatch(
      thunkUpdatePathPlanParams({ uuid: plan.uuid, params: { slopeLimit: 15 } })
    );
    await store.dispatch(thunkRetryPathPlan({ uuid: plan.uuid }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(postNewtonTraverse).not.toHaveBeenCalled();
    expect(onlyPlan(store).request.status).toBe("idle");
  });

  test("moving a point requests once, after the debounce", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    await addTouchedPlan(store);

    const plan = onlyPlan(store);
    expect(plan.pointsTouched).toBe(true);
    expect(plan.points).toEqual([START, GOAL]);
    expect(plan.request.status).toBe("debouncing");

    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS - 1);
    expect(postNewtonTraverse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postNewtonTraverse).mock.calls[0][0]).toMatchObject({
      waypoints: [START, GOAL],
      params: { slopeLimit: NEWTON_DEFAULT_SLOPE_LIMIT },
    });
    expect(onlyPlan(store).request.status).toBe("ready");
    expect(onlyPlan(store).request.row.inputSignature).toBe(signatureFor(START, GOAL));
  });

  test("Finished sends the new points at once instead of waiting out the debounce", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS / 4);
    expect(postNewtonTraverse).not.toHaveBeenCalled();

    await store.dispatch(thunkFlushPathPlan({ uuid }));
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
    expect(onlyPlan(store).request.status).toBe("ready");

    // The cancelled debounce doesn't send a second time, and with nothing waiting a second
    // Finished sends nothing.
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    await store.dispatch(thunkFlushPathPlan({ uuid }));
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
  });

  test("Finished on untouched points sends nothing", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    await store.dispatch(thunkAddPathPlan());
    await store.dispatch(thunkFlushPathPlan({ uuid: onlyPlan(store).uuid }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).not.toHaveBeenCalled();
  });

  test("sends the start, every midpoint and the goal, in order", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    await store.dispatch(thunkAddPathPlan());
    const { uuid } = onlyPlan(store);
    const mids = [
      { lat: 1.002, lng: 2.003 },
      { lat: 0.998, lng: 2.006 },
    ];
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, ...mids, GOAL] }));
    expect(onlyPlan(store).points).toEqual([START, ...mids, GOAL]);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postNewtonTraverse).mock.calls[0][0].waypoints).toEqual([
      START,
      ...mids,
      GOAL,
    ]);
    expect(onlyPlan(store).request.status).toBe("ready");

    // Deleting a midpoint plans again with the remaining points.
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, mids[1], GOAL] }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postNewtonTraverse).mock.calls[1][0].waypoints).toEqual([
      START,
      mids[1],
      GOAL,
    ]);
  });

  test("dragging restarts the debounce and sends only the final points", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);

    for (let step = 1; step <= 5; step++) {
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS / 2);
      await store.dispatch(
        thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.01 + step * 0.001 }] })
      );
    }
    expect(postNewtonTraverse).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postNewtonTraverse).mock.calls[0][0].waypoints[1].lng).toBeCloseTo(2.015, 9);
  });

  test("polls an unfinished row with the poll backoff until it finishes", async () => {
    vi.mocked(postNewtonTraverse)
      .mockResolvedValueOnce({
        status: "success",
        message: "ok",
        data: row("pending", signatureFor(START, GOAL)),
      })
      .mockResolvedValueOnce({
        status: "success",
        message: "ok",
        data: row("succeeded", signatureFor(START, GOAL)),
      });
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.status).toBe("pending");

    await vi.advanceTimersByTimeAsync(1_999);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
    expect(onlyPlan(store).request.status).toBe("ready");
  });

  test("a change mid-poll stops the old poll and requests the new points", async () => {
    answerWith("pending");
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);

    const goal = { lat: 1, lng: 2.02 };
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, goal] }));
    answerWith("succeeded");
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postNewtonTraverse).mock.calls[1][0].waypoints[1]).toEqual(goal);
    expect(onlyPlan(store).request.status).toBe("ready");
    expect(onlyPlan(store).request.row.inputSignature).toBe(signatureFor(START, goal));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
  });

  test("keeps the old row, marked stale, while new points are debouncing", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.03 }] }));
    const plan = onlyPlan(store);
    expect(plan.request.status).toBe("debouncing");
    expect(plan.request.row.inputSignature).toBe(signatureFor(START, GOAL));
  });

  test("keeps the last path found until a newer path replaces it", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    const first = onlyPlan(store).request.pathRow;
    expect(first.inputSignature).toBe(signatureFor(START, GOAL));

    // New points: queued, then failed. The first path stays throughout.
    const blocked = { lat: 1, lng: 2.03 };
    answerWith("pending");
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, blocked] }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.status).toBe("pending");
    expect(onlyPlan(store).request.pathRow).toEqual(first);
    answerWith("failed", { error: { code: "no_path", message: "x", details: [] } });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onlyPlan(store).request.error.message).toBe("No route between start and goal");
    expect(onlyPlan(store).request.pathRow).toEqual(first);

    // Points that plan: the new path replaces the old one.
    const reachable = { lat: 1, lng: 2.02 };
    answerWith("succeeded");
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, reachable] }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.pathRow.inputSignature).toBe(signatureFor(START, reachable));
  });

  test("a Newton failure becomes a readable error with the blocked point", async () => {
    answerWith("failed", {
      error: {
        code: "waypoint_not_traversable",
        message: "blocked",
        details: [{ waypoint: 1, lonlat: [2.01, 1], reason: "slope" }],
      },
    });
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    const { error } = onlyPlan(store).request;
    expect(error.message).toBe("Goal is on steep or blocked terrain");
    expect(error.blockedWaypoints).toEqual([1]);
    expect(error.retryable).toBe(false);
  });

  test("retries 503 with backoff, then reports Newton unavailable", async () => {
    vi.mocked(postNewtonTraverse).mockResolvedValue({
      status: "error",
      message: "unavailable",
      httpStatus: 503,
    });
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(4);
    const { error } = onlyPlan(store).request;
    expect(error.message).toBe("Newton unavailable, try again");
    expect(error.retryable).toBe(true);

    answerWith("succeeded");
    await store.dispatch(thunkRetryPathPlan({ uuid: onlyPlan(store).uuid }));
    expect(postNewtonTraverse).toHaveBeenCalledTimes(5);
    expect(onlyPlan(store).request.status).toBe("ready");
  });

  test("400 is not retried", async () => {
    vi.mocked(postNewtonTraverse).mockResolvedValue({
      status: "failure",
      message: "slopeLimit must be greater than 0",
      httpStatus: 400,
    });
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS + 60_000);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(1);
    expect(onlyPlan(store).request.error.message).toBe("slopeLimit must be greater than 0");
  });

  test("changing params requests again with the new slope limit", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    await store.dispatch(thunkUpdatePathPlanParams({ uuid, params: { slopeLimit: 15 } }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
    expect(vi.mocked(postNewtonTraverse).mock.calls[1][0].params).toEqual({ slopeLimit: 15 });

    await store.dispatch(thunkUpdatePathPlanParams({ uuid, params: { slopeLimit: 15 } }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
  });

  test("points closer than a metre are not sent", async () => {
    answerWith("succeeded");
    const store = createCustomTestStore({
      map: { ...mapInitialState, measureInitialCoords: [START, INITIAL_GOAL] },
      pathPlanner: { ...pathPlannerInitialState },
    });
    await store.dispatch(thunkAddPathPlan());
    await store.dispatch(
      thunkUpdatePathPlanPoints({ uuid: onlyPlan(store).uuid, path: [START, START] })
    );
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).not.toHaveBeenCalled();
    expect(onlyPlan(store).request.status).toBe("idle");
  });

  test("removing a plan or resetting the store cancels its pending request", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    await store.dispatch(thunkRemovePathPlan({ uuid: await addTouchedPlan(store) }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).not.toHaveBeenCalled();
    expect(store.getState().pathPlanner.plans).toHaveLength(0);

    await addTouchedPlan(store);
    await store.dispatch(thunkObliterateMissionSpecificData());
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).not.toHaveBeenCalled();
    expect(store.getState().pathPlanner.plans).toHaveLength(0);
  });

  test("each plan keeps its own colour and request", async () => {
    answerWith("succeeded");
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await addTouchedPlan(store);
    const [first, second] = store.getState().pathPlanner.plans;
    expect(first.color).not.toBe(second.color);
    expect(store.getState().pathPlanner.selectedPlanUuid).toBe(second.uuid);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverse).toHaveBeenCalledTimes(2);
  });
});
