import { v4 as uuidv4 } from "uuid";

import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  isNewtonTraverseFinished,
  newtonPollDelayMs,
  postNewtonTraverse,
} from "http-client/newton";
import { updateMapDirective } from "store/map";
import {
  addPathPlan,
  pathPlanIdle,
  pathPlanRequestFailed,
  pathPlanRequestStarted,
  pathPlanRowReceived,
  removePathPlan,
  setPathPlanInputs,
  setSelectedPathPlanUuid,
} from "store/pathPlanner";
import { isRetryableStatus } from "utils/fetch-with-timeout";
import { getAccurateNow } from "utils/formatting";
import { getDistanceBetweenTwoCoordinates } from "utils/mapping/geoMath";
import { newtonInputSignature, planetFromRadius } from "utils/newtonInputs";
import { pathPlanErrorFromResponse, pathPlanErrorFromRow } from "utils/pathPlanner";

import appCreateAsyncThunk from "./thunkUtil";

import type { AppDispatch } from "utils/useAppDispatch";
import type { RootState } from "store";

/** Wait this long after the last point or parameter change before asking Newton. */
export const NEWTON_TOOL_DEBOUNCE_MS = 2_000;
/** Slope limit (degrees) for new plans; always sent, so Newton's own default never applies. */
export const NEWTON_DEFAULT_SLOPE_LIMIT = 20;
/** Points closer than this are not sent. */
export const NEWTON_TOOL_MIN_DISTANCE_M = 1;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const MAX_RETRIES = 3;

const PLAN_COLORS = ["#ff8c42", "#4ecdc4", "#c77dff", "#f9c74f", "#43aa8b", "#f94144"];

type PlanRuntime = {
  debounce?: ReturnType<typeof setTimeout>;
  inFlight: boolean;
  /** Inputs changed while a request was in flight; request again when it settles. */
  dirty: boolean;
  /** Ends the current poll or retry wait early. */
  wake?: () => void;
};

// Module state, keyed by plan uuid. `generation` invalidates every timer and loop on reset.
const runtimes = new Map<string, PlanRuntime>();
let generation = 0;
const isCurrentGeneration = (value: number) => value === generation;

const runtimeFor = (uuid: string): PlanRuntime => {
  let runtime = runtimes.get(uuid);
  if (!runtime) {
    runtime = { inFlight: false, dirty: false };
    runtimes.set(uuid, runtime);
  }
  return runtime;
};

/** Waits `ms`, or less if the plan's inputs change or it is removed. */
const wait = (runtime: PlanRuntime, ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      if (runtime.wake === done) runtime.wake = undefined;
      resolve();
    }
    runtime.wake = done;
  });

/** Stops every pending request loop and timer; called when the store is reset. */
export function stopPathPlanner(): void {
  generation++;
  for (const runtime of runtimes.values()) {
    clearTimeout(runtime.debounce);
    runtime.wake?.();
  }
  runtimes.clear();
}

const findPlan = (state: RootState, uuid: string) =>
  state.pathPlanner.plans.find((plan) => plan.uuid === uuid);

/** The signature for a plan's current inputs, or null when Newton can't plan it. */
function planSignature(
  plan: PathPlan,
  mission: Pick<Mission, "planetRadius"> | undefined
): { signature: string; waypoints: AEGISPoint[] } | null {
  const planet = planetFromRadius(mission?.planetRadius);
  if (!planet) return null;
  const waypoints = [plan.start, plan.goal];
  return { signature: newtonInputSignature(planet, waypoints, plan.params), waypoints };
}

/** Restarts the plan's debounce; the request goes out once its inputs are still. */
function schedulePathPlanRequest(dispatch: AppDispatch, uuid: string): void {
  const runtime = runtimeFor(uuid);
  clearTimeout(runtime.debounce);
  // Stop polling for the old inputs now; the debounce sends the new request.
  runtime.wake?.();
  const scheduledGeneration = generation;
  runtime.debounce = setTimeout(() => {
    runtime.debounce = undefined;
    if (scheduledGeneration !== generation) return;
    dispatch(thunkRunPathPlanRequest({ uuid }));
  }, NEWTON_TOOL_DEBOUNCE_MS);
}

/**
 * Requests the plan's path and polls until the row finishes. At most one runs per plan; a
 * change while it runs marks the plan dirty and it runs again for the latest inputs.
 */
export const thunkRunPathPlanRequest = appCreateAsyncThunk<{ uuid: string }>(
  "pathPlanner/runRequest",
  async ({ uuid }, { dispatch, getState }) => {
    const runtime = runtimeFor(uuid);
    if (runtime.inFlight) {
      runtime.dirty = true;
      return;
    }
    const runGeneration = generation;
    const handle = getMissionDocHandle();
    const stillWanted = (signature: string) => {
      if (runGeneration !== generation || getMissionDocHandle() !== handle) return false;
      const plan = findPlan(getState(), uuid);
      return !!plan && plan.request.inputSignature === signature;
    };

    runtime.inFlight = true;
    try {
      do {
        runtime.dirty = false;
        const plan = findPlan(getState(), uuid);
        const mission = handle?.doc();
        if (!plan || !mission) return;
        if (!plan.pointsTouched) return;
        if (runtime.debounce) return; // a newer change is still settling

        const planned = planSignature(plan, mission);
        if (!planned) {
          dispatch(pathPlanIdle(uuid));
          dispatch(
            pathPlanRequestFailed({
              uuid,
              inputSignature: null,
              error: {
                message: "This mission's planet isn't supported by Newton",
                retryable: false,
                blockedWaypoints: [],
              },
            })
          );
          return;
        }
        const distance = getDistanceBetweenTwoCoordinates(
          plan.start,
          plan.goal,
          mission.planetRadius
        );
        if (!(distance >= NEWTON_TOOL_MIN_DISTANCE_M)) {
          dispatch(pathPlanIdle(uuid));
          continue;
        }

        const { signature, waypoints } = planned;
        dispatch(pathPlanRequestStarted({ uuid, inputSignature: signature }));
        let polls = 0;
        let retries = 0;
        while (stillWanted(signature) && !runtime.dirty) {
          let response: NewtonTraverseResponse;
          try {
            response = await postNewtonTraverse({
              missionId: mission.id,
              waypoints,
              params: plan.params,
            });
          } catch (reason) {
            response = {
              status: "error",
              message: reason instanceof Error ? reason.message : String(reason),
            };
          }
          if (!stillWanted(signature) || runtime.dirty) break;

          if (response.status !== "success" || !response.data) {
            const error = pathPlanErrorFromResponse(response);
            if (isRetryableStatus(response.httpStatus) && retries < MAX_RETRIES) {
              await wait(runtime, Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retries++));
              continue;
            }
            dispatch(pathPlanRequestFailed({ uuid, inputSignature: signature, error }));
            break;
          }

          retries = 0;
          dispatch(pathPlanRowReceived({ uuid, inputSignature: signature, row: response.data }));
          if (isNewtonTraverseFinished(response.data)) {
            const error = pathPlanErrorFromRow(response.data);
            if (error) dispatch(pathPlanRequestFailed({ uuid, inputSignature: signature, error }));
            break;
          }
          await wait(runtime, newtonPollDelayMs(polls++));
        }
      } while (runtime.dirty && isCurrentGeneration(runGeneration));
    } finally {
      if (runGeneration === generation) runtime.inFlight = false;
    }
  }
);

export const thunkAddPathPlan = appCreateAsyncThunk<void>(
  "pathPlanner/add",
  async (__, { dispatch, getState }) => {
    // A new plan replaces the source features a live Modify may hold; end any edit first.
    if (getState().map.mapDirective) dispatch(updateMapDirective(null));

    let path: AEGISPoint[] = getState().map.measureInitialCoords;
    if (!path || path.length < 2) {
      const lander = getMissionDocHandle()?.doc()?.landerLocation;
      const lat = lander?.lat ?? 0;
      const lng = lander?.lng ?? 0;
      path = [
        { lat, lng: lng - 0.003 },
        { lat, lng: lng + 0.003 },
      ];
    }

    const uuid = uuidv4();
    const count = getState().pathPlanner.plans.length;
    dispatch(
      addPathPlan({
        uuid,
        createdAt: getAccurateNow().toISOString(),
        color: PLAN_COLORS[count % PLAN_COLORS.length],
        start: path[0],
        goal: path[path.length - 1],
        pointsTouched: false,
        params: { slopeLimit: NEWTON_DEFAULT_SLOPE_LIMIT },
        request: { status: "idle", inputSignature: null, row: null, error: null },
      })
    );
    dispatch(setSelectedPathPlanUuid(uuid));
  }
);

/** Called on every drag tick and on `modifyend`; only the debounce sends requests. */
export const thunkUpdatePathPlanPoints = appCreateAsyncThunk<{
  uuid: string;
  path: AEGISPoint[];
}>("pathPlanner/updatePoints", async ({ uuid, path }, { dispatch, getState }) => {
  const plan = findPlan(getState(), uuid);
  if (!plan || path.length < 2) return;
  const start = path[0];
  const goal = path[path.length - 1];
  if (
    start.lat === plan.start.lat &&
    start.lng === plan.start.lng &&
    goal.lat === plan.goal.lat &&
    goal.lng === plan.goal.lng
  )
    return;
  dispatch(setPathPlanInputs({ uuid, start, goal }));
  schedulePathPlanRequest(dispatch, uuid);
});

export const thunkUpdatePathPlanParams = appCreateAsyncThunk<{
  uuid: string;
  params: NewtonTraverseParams;
}>("pathPlanner/updateParams", async ({ uuid, params }, { dispatch, getState }) => {
  const plan = findPlan(getState(), uuid);
  if (!plan) return;
  if (
    (plan.params.slopeLimit ?? null) === (params.slopeLimit ?? null) &&
    (plan.params.slopeBufferM ?? null) === (params.slopeBufferM ?? null)
  )
    return;
  dispatch(setPathPlanInputs({ uuid, params }));
  if (plan.pointsTouched) schedulePathPlanRequest(dispatch, uuid);
});

/**
 * Sends the plan's current points now instead of waiting out the debounce (the "Finished"
 * button). Does nothing if the points haven't been moved or no change is waiting.
 */
export const thunkFlushPathPlan = appCreateAsyncThunk<{ uuid: string }>(
  "pathPlanner/flush",
  async ({ uuid }, { dispatch, getState }) => {
    const plan = findPlan(getState(), uuid);
    const runtime = runtimes.get(uuid);
    if (!plan?.pointsTouched || !runtime?.debounce) return;
    clearTimeout(runtime.debounce);
    runtime.debounce = undefined;
    await dispatch(thunkRunPathPlanRequest({ uuid }));
  }
);

/** Retries a failed request now, without the debounce. */
export const thunkRetryPathPlan = appCreateAsyncThunk<{ uuid: string }>(
  "pathPlanner/retry",
  async ({ uuid }, { dispatch, getState }) => {
    const plan = findPlan(getState(), uuid);
    if (!plan?.pointsTouched) return;
    dispatch(setPathPlanInputs({ uuid }));
    const runtime = runtimeFor(uuid);
    clearTimeout(runtime.debounce);
    runtime.debounce = undefined;
    await dispatch(thunkRunPathPlanRequest({ uuid }));
  }
);

export const thunkRemovePathPlan = appCreateAsyncThunk<{ uuid: string }>(
  "pathPlanner/remove",
  async ({ uuid }, { dispatch, getState }) => {
    if (getState().map.mapDirective?.uuid === uuid) dispatch(updateMapDirective(null));
    const runtime = runtimes.get(uuid);
    if (runtime) {
      clearTimeout(runtime.debounce);
      runtime.wake?.();
    }
    runtimes.delete(uuid);
    dispatch(removePathPlan(uuid));
  }
);
