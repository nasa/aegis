vi.mock("http-client/newton");
import {
  deleteNewtonTraverse,
  getNewtonCoverage,
  getNewtonTraverses,
  postNewtonTraverses,
} from "http-client/newton";
import { createCustomTestStore } from "../../fixtures/store";
import { initialState as pathPlannerInitialState } from "store/pathPlanner";
import { initialState as mapInitialState } from "store/map";
import {
  NEWTON_DEFAULT_SLOPE_LIMIT,
  NEWTON_TOOL_DEBOUNCE_MS,
  newtonCoverageKey,
  stopPathPlanner,
  thunkCheckNewtonCoverage,
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

function result(
  traverseId: string,
  status: NewtonTraverseStatus,
  overrides: Partial<NewtonTraverseResult> = {}
): NewtonTraverseResult {
  return {
    traverseId,
    status,
    cancelRequested: false,
    waypoints: [START, GOAL],
    params: {},
    requestHash: null,
    path: status === "succeeded" ? [START, { lat: 1.001, lng: 2.005 }, GOAL] : null,
    segmentDistances: status === "succeeded" ? [100, 200] : null,
    rawVertexCount: null,
    mapInfo: null,
    runtimeMs: null,
    error: null,
    ...overrides,
  };
}

/**
 * A fake Newton behind the proxy: each new signature gets a new job (`t1`, `t2`, …), and an
 * identical one gets the same job back as `reuse`. Jobs answer `status` on every poll.
 */
function fakeNewton({
  status = "succeeded" as NewtonTraverseStatus,
  reuse = "new" as NewtonTraverseReuse,
  overrides = {} as Partial<NewtonTraverseResult>,
} = {}) {
  const ids = new Map<string, string>();
  const jobs = new Map<
    string,
    { status: NewtonTraverseStatus; overrides: Partial<NewtonTraverseResult> }
  >();
  const fake = {
    /** Sets what every job answers from now on. */
    answer(next: NewtonTraverseStatus, nextOverrides: Partial<NewtonTraverseResult> = {}) {
      status = next;
      overrides = nextOverrides;
      for (const job of jobs.values()) Object.assign(job, { status, overrides });
    },
    reuse(next: NewtonTraverseReuse) {
      reuse = next;
    },
    ids,
  };
  vi.mocked(postNewtonTraverses).mockImplementation(async (_missionId, traverses) =>
    traverses.map(({ waypoints, params }) => {
      const signature = newtonInputSignature("moon", waypoints, params ?? {});
      const known = ids.get(signature);
      const traverseId = known ?? `t${ids.size + 1}`;
      ids.set(signature, traverseId);
      jobs.set(traverseId, { status, overrides });
      return {
        status: "success",
        message: "ok",
        data: {
          traverseId,
          inputSignature: signature,
          requestHash: null as string | null,
          reuse: known ? "cached" : reuse,
        },
      } satisfies NewtonTraverseSubmitResponse;
    })
  );
  vi.mocked(getNewtonTraverses).mockImplementation(async (_missionId, traverseIds) =>
    traverseIds.map((traverseId): NewtonTraverseResultResponse => {
      const job = jobs.get(traverseId);
      if (!job) return { status: "error", message: "not found", httpStatus: 404 };
      return {
        status: "success",
        message: "ok",
        data: result(traverseId, job.status, job.overrides),
      };
    })
  );
  return fake;
}

const posted = () => vi.mocked(postNewtonTraverses).mock.calls.map((call) => call[1][0]);
const cancelled = () => vi.mocked(deleteNewtonTraverse).mock.calls.map((call) => call[1]);

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
    fakeNewton();
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
    expect(postNewtonTraverses).not.toHaveBeenCalled();
    expect(onlyPlan(store).request.status).toBe("idle");
  });

  test("moving a point submits once, after the debounce, then polls the job by id", async () => {
    fakeNewton();
    const store = storeWithPoints();
    await addTouchedPlan(store);

    const plan = onlyPlan(store);
    expect(plan.pointsTouched).toBe(true);
    expect(plan.points).toEqual([START, GOAL]);
    expect(plan.request.status).toBe("debouncing");

    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS - 1);
    expect(postNewtonTraverses).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
    expect(vi.mocked(postNewtonTraverses).mock.calls[0][1]).toEqual([
      { waypoints: [START, GOAL], params: { slopeLimit: NEWTON_DEFAULT_SLOPE_LIMIT } },
    ]);
    expect(vi.mocked(getNewtonTraverses).mock.calls[0][1]).toEqual(["t1"]);
    const { request } = onlyPlan(store);
    expect(request.status).toBe("ready");
    expect(request.traverseId).toBe("t1");
    expect(request.result.inputSignature).toBe(signatureFor(START, GOAL));
    expect(request.pathResult.traverseId).toBe("t1");
  });

  test("Finished sends the new points at once instead of waiting out the debounce", async () => {
    fakeNewton();
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS / 4);
    expect(postNewtonTraverses).not.toHaveBeenCalled();

    await store.dispatch(thunkFlushPathPlan({ uuid }));
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
    expect(onlyPlan(store).request.status).toBe("ready");

    // The cancelled debounce doesn't send a second time, and with nothing waiting a second
    // Finished sends nothing.
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    await store.dispatch(thunkFlushPathPlan({ uuid }));
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
  });

  test("Finished on untouched points sends nothing", async () => {
    fakeNewton();
    const store = storeWithPoints();
    await store.dispatch(thunkAddPathPlan());
    await store.dispatch(thunkFlushPathPlan({ uuid: onlyPlan(store).uuid }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).not.toHaveBeenCalled();
  });

  test("sends the start, every midpoint and the goal, in order", async () => {
    fakeNewton();
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

    expect(posted().map((entry) => entry.waypoints)).toEqual([[START, ...mids, GOAL]]);
    expect(onlyPlan(store).request.status).toBe("ready");

    // Deleting a midpoint plans again with the remaining points.
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, mids[1], GOAL] }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(posted()[1].waypoints).toEqual([START, mids[1], GOAL]);
  });

  test("dragging restarts the debounce and sends only the final points", async () => {
    fakeNewton();
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);

    for (let step = 1; step <= 5; step++) {
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS / 2);
      await store.dispatch(
        thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.01 + step * 0.001 }] })
      );
    }
    expect(postNewtonTraverses).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
    expect(posted()[0].waypoints[1].lng).toBeCloseTo(2.015, 9);
  });

  test("polls an unfinished job with the poll backoff until it finishes, without re-posting", async () => {
    const newton = fakeNewton({ status: "pending" });
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.status).toBe("pending");
    expect(onlyPlan(store).request.result.status).toBe("pending");
    expect(getNewtonTraverses).toHaveBeenCalledTimes(1);

    newton.answer("in_progress");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onlyPlan(store).request.result.status).toBe("in_progress");

    newton.answer("succeeded");
    await vi.advanceTimersByTimeAsync(3_999);
    expect(getNewtonTraverses).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(getNewtonTraverses).toHaveBeenCalledTimes(3);
    expect(onlyPlan(store).request.status).toBe("ready");
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
    expect(deleteNewtonTraverse).not.toHaveBeenCalled();
  });

  test("submits again when Newton no longer knows the job", async () => {
    fakeNewton();
    vi.mocked(getNewtonTraverses).mockResolvedValueOnce([
      { status: "error", message: "not found", httpStatus: 404 },
    ]);
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
    expect(onlyPlan(store).request.status).toBe("ready");
    expect(deleteNewtonTraverse).not.toHaveBeenCalled();
  });

  describe("stale jobs", () => {
    test("editing while t1 is unfinished submits t2, then cancels t1", async () => {
      const newton = fakeNewton({ status: "pending" });
      const store = storeWithPoints();
      const uuid = await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      expect(onlyPlan(store).request.traverseId).toBe("t1");

      const goal = { lat: 1, lng: 2.02 };
      await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, goal] }));
      // Nothing is cancelled while the edit is still settling.
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS - 1);
      expect(deleteNewtonTraverse).not.toHaveBeenCalled();

      newton.answer("succeeded");
      vi.mocked(deleteNewtonTraverse).mockImplementationOnce(async () => {
        // t2 was posted first.
        expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
        return { status: "success", message: "Cancel requested", data: { status: "cancelled" } };
      });
      await vi.advanceTimersByTimeAsync(1);
      expect(cancelled()).toEqual(["t1"]);
      expect(vi.mocked(deleteNewtonTraverse).mock.calls[0][0]).toBe(
        vi.mocked(postNewtonTraverses).mock.calls[0][0]
      );
      expect(onlyPlan(store).request).toMatchObject({ status: "ready", traverseId: "t2" });
      expect(onlyPlan(store).request.result.inputSignature).toBe(signatureFor(START, goal));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
    });

    test("a finished job is never cancelled", async () => {
      fakeNewton();
      const store = storeWithPoints();
      const uuid = await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      await store.dispatch(
        thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.02 }] })
      );
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
      expect(deleteNewtonTraverse).not.toHaveBeenCalled();
    });

    test.each(["cached", "deduplicated"] as const)(
      "a %s job is shared with other callers and never cancelled",
      async (reuse) => {
        fakeNewton({ status: "pending", reuse });
        const store = storeWithPoints();
        const uuid = await addTouchedPlan(store);
        await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
        await store.dispatch(
          thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.02 }] })
        );
        await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
        await store.dispatch(thunkRemovePathPlan({ uuid }));
        expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
        expect(deleteNewtonTraverse).not.toHaveBeenCalled();
      }
    );

    test("returning to earlier inputs reuses their job and doesn't cancel it", async () => {
      const newton = fakeNewton({ status: "pending" });
      const store = storeWithPoints();
      const uuid = await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      // A drag that ends where it started: same inputs, so Newton hands back t1.
      await store.dispatch(
        thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.03 }] })
      );
      await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, GOAL] }));
      newton.answer("succeeded");
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
      expect(onlyPlan(store).request.traverseId).toBe("t1");
      expect(deleteNewtonTraverse).not.toHaveBeenCalled();
    });

    test("removing a plan mid-poll cancels its job", async () => {
      fakeNewton({ status: "in_progress" });
      const store = storeWithPoints();
      const uuid = await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      await store.dispatch(thunkRemovePathPlan({ uuid }));
      expect(cancelled()).toEqual(["t1"]);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(getNewtonTraverses).toHaveBeenCalledTimes(1);
    });

    test("removing a plan while its POST is in flight cancels the job once it's known", async () => {
      fakeNewton({ status: "pending" });
      let answer: (value: NewtonTraverseSubmitResponse[]) => void;
      vi.mocked(postNewtonTraverses).mockImplementationOnce(
        () => new Promise((resolve) => (answer = resolve))
      );
      const store = storeWithPoints();
      const uuid = await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      await store.dispatch(thunkRemovePathPlan({ uuid }));
      expect(deleteNewtonTraverse).not.toHaveBeenCalled();

      answer([
        {
          status: "success",
          message: "ok",
          data: { traverseId: "late", inputSignature: "", requestHash: null, reuse: "new" },
        },
      ]);
      await vi.advanceTimersByTimeAsync(0);
      expect(cancelled()).toEqual(["late"]);
      expect(getNewtonTraverses).not.toHaveBeenCalled();
    });

    test("resetting the store cancels every unfinished job", async () => {
      fakeNewton({ status: "pending" });
      const store = storeWithPoints();
      await addTouchedPlan(store);
      await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      // Both plans have the same inputs, so the second gets t1 back as `cached`.
      await store.dispatch(thunkObliterateMissionSpecificData());
      expect(cancelled()).toEqual(["t1"]);
    });

    test("a failed cancel is only logged", async () => {
      fakeNewton({ status: "pending" });
      vi.mocked(deleteNewtonTraverse).mockRejectedValueOnce(new Error("offline"));
      const store = storeWithPoints();
      const uuid = await addTouchedPlan(store);
      await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
      await store.dispatch(thunkRemovePathPlan({ uuid }));
      await vi.advanceTimersByTimeAsync(0);
      expect(cancelled()).toEqual(["t1"]);
      expect(store.getState().pathPlanner.plans).toHaveLength(0);
    });
  });

  test("keeps the old result, marked stale, while new points are debouncing", async () => {
    fakeNewton();
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, { lat: 1, lng: 2.03 }] }));
    const plan = onlyPlan(store);
    expect(plan.request.status).toBe("debouncing");
    expect(plan.request.traverseId).toBeNull();
    expect(plan.request.result.inputSignature).toBe(signatureFor(START, GOAL));
  });

  test("keeps the last path found until a newer path replaces it", async () => {
    const newton = fakeNewton();
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    const first = onlyPlan(store).request.pathResult;
    expect(first.inputSignature).toBe(signatureFor(START, GOAL));

    // New points: pending, then failed. The first path stays throughout.
    const blocked = { lat: 1, lng: 2.03 };
    newton.answer("pending");
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, blocked] }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.status).toBe("pending");
    expect(onlyPlan(store).request.pathResult).toEqual(first);
    newton.answer("failed", { error: { code: "no_path", message: "x", details: [] } });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onlyPlan(store).request.error.message).toBe("No route between start and goal");
    expect(onlyPlan(store).request.pathResult).toEqual(first);

    // Points that plan: the new path replaces the old one.
    const reachable = { lat: 1, lng: 2.02 };
    newton.answer("succeeded");
    await store.dispatch(thunkUpdatePathPlanPoints({ uuid, path: [START, reachable] }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.pathResult.inputSignature).toBe(signatureFor(START, reachable));
  });

  test("a Newton failure becomes a readable error with the blocked point", async () => {
    fakeNewton({
      status: "failed",
      overrides: {
        error: {
          code: "waypoint_not_traversable",
          message: "blocked",
          details: [{ waypoint: 1, lonlat: [2.01, 1], reason: "slope" }],
        },
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

  test("retries a 503 POST with backoff, then reports Newton unavailable", async () => {
    vi.mocked(postNewtonTraverses).mockResolvedValue([
      { status: "error", message: "unavailable", httpStatus: 503 },
    ]);
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_000 + 4_000 + 8_000);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(4);
    const { error } = onlyPlan(store).request;
    expect(error.message).toBe("Newton unavailable, try again");
    expect(error.retryable).toBe(true);

    fakeNewton();
    await store.dispatch(thunkRetryPathPlan({ uuid: onlyPlan(store).uuid }));
    expect(postNewtonTraverses).toHaveBeenCalledTimes(5);
    expect(onlyPlan(store).request.status).toBe("ready");
  });

  test("retries a failed poll without re-posting", async () => {
    fakeNewton();
    vi.mocked(getNewtonTraverses).mockRejectedValueOnce(new Error("network"));
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(onlyPlan(store).request.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(getNewtonTraverses).toHaveBeenCalledTimes(2);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
    expect(onlyPlan(store).request.status).toBe("ready");
  });

  test("400 is not retried", async () => {
    vi.mocked(postNewtonTraverses).mockResolvedValue([
      { status: "error", message: "slopeLimit must be greater than 0", httpStatus: 400 },
    ]);
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS + 60_000);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(1);
    expect(onlyPlan(store).request.error.message).toBe("slopeLimit must be greater than 0");
  });

  test("changing params requests again with the new slope limit", async () => {
    fakeNewton();
    const store = storeWithPoints();
    const uuid = await addTouchedPlan(store);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);

    await store.dispatch(thunkUpdatePathPlanParams({ uuid, params: { slopeLimit: 15 } }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
    expect(posted()[1].params).toEqual({ slopeLimit: 15 });

    await store.dispatch(thunkUpdatePathPlanParams({ uuid, params: { slopeLimit: 15 } }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
  });

  test("points closer than a metre are not sent", async () => {
    fakeNewton();
    const store = storeWithPoints();
    await store.dispatch(thunkAddPathPlan());
    await store.dispatch(
      thunkUpdatePathPlanPoints({ uuid: onlyPlan(store).uuid, path: [START, START] })
    );
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).not.toHaveBeenCalled();
    expect(onlyPlan(store).request.status).toBe("idle");
  });

  test("removing a plan or resetting the store stops its pending request", async () => {
    fakeNewton();
    const store = storeWithPoints();
    await store.dispatch(thunkRemovePathPlan({ uuid: await addTouchedPlan(store) }));
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).not.toHaveBeenCalled();
    expect(store.getState().pathPlanner.plans).toHaveLength(0);

    await addTouchedPlan(store);
    await store.dispatch(thunkObliterateMissionSpecificData());
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).not.toHaveBeenCalled();
    expect(store.getState().pathPlanner.plans).toHaveLength(0);
  });

  test("each plan keeps its own colour and request", async () => {
    fakeNewton();
    const store = storeWithPoints();
    await addTouchedPlan(store);
    await addTouchedPlan(store);
    const [first, second] = store.getState().pathPlanner.plans;
    expect(first.color).not.toBe(second.color);
    expect(store.getState().pathPlanner.selectedPlanUuid).toBe(second.uuid);
    await vi.advanceTimersByTimeAsync(NEWTON_TOOL_DEBOUNCE_MS);
    expect(postNewtonTraverses).toHaveBeenCalledTimes(2);
  });
});

describe("Newton coverage", () => {
  const covered: NewtonCoverage = {
    supported: true,
    reason: "covered",
    planet: "moon",
    probedBy: "dem_extent",
    maps: [{ name: "ms3_slope", resolution: [1, 1] }],
  };
  const key = newtonCoverageKey({
    id: 50,
    demFilePath: "Data/dem.tif",
    planetRadius: 1_737_400,
    landerLocation: START,
  });

  it("checks once per mission and DEM", async () => {
    vi.mocked(getNewtonCoverage).mockResolvedValue({
      status: "success",
      message: "ok",
      data: covered,
    });
    const store = storeWithPoints();
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key }));
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key }));
    expect(getNewtonCoverage).toHaveBeenCalledTimes(1);
    expect(store.getState().pathPlanner.coverage).toEqual({
      key,
      status: "ready",
      coverage: covered,
    });

    const otherDem = newtonCoverageKey({
      id: 50,
      demFilePath: "Data/other.tif",
      planetRadius: 1_737_400,
      landerLocation: START,
    });
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key: otherDem }));
    expect(getNewtonCoverage).toHaveBeenCalledTimes(2);
  });

  it("records a failed check, and checks again when asked", async () => {
    vi.mocked(getNewtonCoverage).mockRejectedValueOnce(new Error("offline"));
    const store = storeWithPoints();
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key }));
    expect(store.getState().pathPlanner.coverage).toMatchObject({ status: "error" });

    vi.mocked(getNewtonCoverage).mockResolvedValueOnce({
      status: "success",
      message: "ok",
      data: covered,
    });
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key }));
    expect(store.getState().pathPlanner.coverage).toMatchObject({ status: "ready" });
  });

  it("keeps the answer while it checks again, and greys out once Newton stops answering", async () => {
    vi.mocked(getNewtonCoverage).mockResolvedValueOnce({
      status: "success",
      message: "ok",
      data: covered,
    });
    const store = storeWithPoints();
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key }));

    let answer: (value: WrappedResponse<NewtonCoverage>) => void;
    vi.mocked(getNewtonCoverage).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    );
    const pending = store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key, recheck: true }));
    expect(store.getState().pathPlanner.coverage).toMatchObject({ status: "ready" });
    // A second recheck while one is in flight doesn't ask again.
    await store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key, recheck: true }));
    expect(getNewtonCoverage).toHaveBeenCalledTimes(2);

    answer({ status: "error", message: "Newton is unavailable" });
    await pending;
    expect(store.getState().pathPlanner.coverage).toEqual({ key, status: "error", coverage: null });
  });

  it("drops an answer for a mission that is no longer open", async () => {
    let answer: (value: WrappedResponse<NewtonCoverage>) => void;
    vi.mocked(getNewtonCoverage).mockImplementationOnce(
      () => new Promise((resolve) => (answer = resolve))
    );
    const store = storeWithPoints();
    const pending = store.dispatch(thunkCheckNewtonCoverage({ missionId: 50, key }));
    await store.dispatch(thunkObliterateMissionSpecificData());
    answer({ status: "success", message: "ok", data: covered });
    await pending;
    expect(store.getState().pathPlanner.coverage).toEqual(pathPlannerInitialState.coverage);
  });
});
