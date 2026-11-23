import { v4 as uuidv4 } from "uuid";

import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  deleteNewtonTraverse,
  getNewtonCoverage,
  getNewtonTraverses,
  isNewtonTraverseFinished,
  newtonPollDelayMs,
  postNewtonTraverses,
} from "http-client/newton";
import { updateMapDirective } from "store/map";
import {
  addPathPlan,
  coverageCheckStarted,
  coverageReceived,
  pathPlanIdle,
  pathPlanRequestFailed,
  pathPlanRequestStarted,
  pathPlanResultReceived,
  pathPlanSubmitted,
  removePathPlan,
  setPathPlanInputs,
  setSelectedPathPlanUuid,
} from "store/pathPlanner";
import { isRetryableStatus } from "utils/fetch-with-timeout";
import { getAccurateNow } from "utils/formatting";
import { clientLogger } from "utils/logging/clientLogger";
import { newtonInputSignature, planetFromRadius } from "utils/newtonInputs";
import {
  pathLengthMeters,
  pathPlanErrorFromResponse,
  pathPlanErrorFromResult,
} from "utils/pathPlanner";

import appCreateAsyncThunk from "./thunkUtil";

import type { AppDispatch } from "utils/useAppDispatch";
import type { RootState } from "store";

/** Wait this long after the last point or parameter change before asking Newton. */
export const NEWTON_TOOL_DEBOUNCE_MS = 750;
/** Slope limit (degrees) for new plans; always sent, so Newton's own default never applies. */
export const NEWTON_DEFAULT_SLOPE_LIMIT = 20;
/** Points closer than this are not sent. */
export const NEWTON_TOOL_MIN_DISTANCE_M = 1;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const MAX_RETRIES = 3;

const PLAN_COLORS = ["#ff8c42", "#4ecdc4", "#c77dff", "#f9c74f", "#43aa8b", "#f94144"];

/** The Newton job a plan last submitted. */
type SubmittedJob = {
  missionId: number;
  traverseId: string;
  /** Only `new` jobs are ours to cancel; the others are shared with other callers. */
  reuse: NewtonTraverseReuse;
  /** Last status seen, or null before the first poll. */
  status: NewtonTraverseStatus | null;
};

type PlanRuntime = {
  debounce?: ReturnType<typeof setTimeout>;
  job?: SubmittedJob;
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

const entryOf = <T>(entries: NewtonEntryResponse<T>[]): NewtonEntryResponse<T> => entries[0];

const failedEntry = (reason: unknown): NewtonEntryResponse<never> => ({
  status: "error",
  message: reason instanceof Error ? reason.message : String(reason),
});

/** Cancels `job` if this tab started it and it hasn't finished. Never waits or throws. */
function cancelIfOurs(job: SubmittedJob | undefined): void {
  if (!job || job.reuse !== "new") return;
  if (job.status && isNewtonTraverseFinished({ status: job.status })) return;
  deleteNewtonTraverse(job.missionId, job.traverseId)
    .then((response) => {
      if (response.status === "success") return;
      clientLogger.warning({
        logId: "pathPlanner:cancelIfOurs:cancelRefused",
        logValue: `Newton didn't cancel ${job.traverseId}: ${response.message}`,
      });
    })
    .catch((reason) =>
      clientLogger.warning({
        logId: "pathPlanner:cancelIfOurs:cancelFailed",
        logValue: `Couldn't cancel ${job.traverseId}: ${reason instanceof Error ? reason.message : String(reason)}`,
      })
    );
}

/** Makes `submission` the plan's job and cancels the job it replaces. */
function adoptJob(runtime: PlanRuntime, missionId: number, submission: NewtonTraverseSubmission) {
  const previous = runtime.job;
  if (previous?.traverseId === submission.traverseId) return; // the same job, still ours
  runtime.job = {
    missionId,
    traverseId: submission.traverseId,
    reuse: submission.reuse,
    status: null,
  };
  cancelIfOurs(previous);
}

/** The plan no longer wants its job: cancel it if it's ours and still running. */
function dropJob(runtime: PlanRuntime | undefined): void {
  if (!runtime) return;
  cancelIfOurs(runtime.job);
  runtime.job = undefined;
}

/** Stops every request loop and timer, and cancels unfinished jobs; called on store reset. */
export function stopPathPlanner(): void {
  generation++;
  for (const runtime of runtimes.values()) {
    clearTimeout(runtime.debounce);
    runtime.wake?.();
    dropJob(runtime);
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
  const waypoints = plan.points;
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
 * Submits the plan's inputs to Newton, then polls the job until it finishes. At most one runs
 * per plan; a change while it runs marks the plan dirty and it runs again for the latest
 * inputs. A new submission cancels the plan's previous job if this tab started it and it is
 * unfinished.
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
        if (!(pathLengthMeters(plan.points, mission.planetRadius) >= NEWTON_TOOL_MIN_DISTANCE_M)) {
          dropJob(runtime);
          dispatch(pathPlanIdle(uuid));
          continue;
        }

        const { signature, waypoints } = planned;
        const missionId = mission.id;
        dispatch(pathPlanRequestStarted({ uuid, inputSignature: signature }));
        let traverseId: string | null = null;
        let polls = 0;
        let retries = 0;
        const retryOrFail = async (response: NewtonEntryResponse<unknown>): Promise<boolean> => {
          if (isRetryableStatus(response.httpStatus) && retries < MAX_RETRIES) {
            await wait(runtime, Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retries++));
            return true;
          }
          const error = pathPlanErrorFromResponse(response);
          dispatch(pathPlanRequestFailed({ uuid, inputSignature: signature, error }));
          return false;
        };

        while (stillWanted(signature) && !runtime.dirty) {
          if (!traverseId) {
            const response = await postNewtonTraverses(missionId, [
              { waypoints, params: plan.params },
            ]).then(entryOf, failedEntry);
            if (response.status === "success" && response.data) {
              // Adopt it even if the inputs changed meanwhile, so the next submission cancels it.
              adoptJob(runtime, missionId, response.data);
              const gone =
                runGeneration !== generation ||
                getMissionDocHandle() !== handle ||
                !findPlan(getState(), uuid);
              if (gone) dropJob(runtime);
            }
            if (!stillWanted(signature) || runtime.dirty) break;
            if (response.status !== "success" || !response.data) {
              if (await retryOrFail(response)) continue;
              dropJob(runtime);
              break;
            }
            traverseId = response.data.traverseId;
            dispatch(pathPlanSubmitted({ uuid, inputSignature: signature, traverseId }));
            continue;
          }

          const response = await getNewtonTraverses(missionId, [traverseId]).then(
            entryOf,
            failedEntry
          );
          if (!stillWanted(signature) || runtime.dirty) break;
          if (response.status !== "success" || !response.data) {
            if (response.httpStatus === 404 && retries < MAX_RETRIES) {
              // Newton no longer has the job: submit again.
              retries++;
              runtime.job = undefined;
              traverseId = null;
              continue;
            }
            if (await retryOrFail(response)) continue;
            break;
          }

          retries = 0;
          const result = response.data;
          if (runtime.job?.traverseId === traverseId) runtime.job.status = result.status;
          dispatch(
            pathPlanResultReceived({ uuid, result: { ...result, inputSignature: signature } })
          );
          if (isNewtonTraverseFinished(result)) {
            const error = pathPlanErrorFromResult(result);
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

/** The inputs Newton coverage depends on; a change means checking again. */
export const newtonCoverageKey = (
  mission: Pick<Mission, "id" | "demFilePath" | "planetRadius" | "landerLocation">
): string =>
  JSON.stringify([
    mission.id,
    mission.demFilePath ?? "",
    mission.planetRadius ?? null,
    mission.landerLocation?.lat ?? null,
    mission.landerLocation?.lng ?? null,
  ]);

/** How often to check again that Newton still answers, and to retry once it hasn't. */
export const NEWTON_COVERAGE_RECHECK_MS = 60_000;
export const NEWTON_COVERAGE_RETRY_MS = 15_000;

let coverageCheckInFlight = false;

/**
 * Checks Newton coverage for the mission, unless this key is already checked or checking.
 * `recheck` asks again for a key that has an answer, keeping that answer until the new one.
 */
export const thunkCheckNewtonCoverage = appCreateAsyncThunk<{
  missionId: number;
  key: string;
  recheck?: boolean;
}>(
  "pathPlanner/checkCoverage",
  async ({ missionId, key, recheck = false }, { dispatch, getState }) => {
    const current = getState().pathPlanner.coverage;
    const answered = current.key === key && current.status !== "idle";
    if (answered && current.status === "checking") return;
    if (answered && current.status === "ready" && !recheck) return;
    if (answered && coverageCheckInFlight) return;
    if (!answered) dispatch(coverageCheckStarted(key));
    coverageCheckInFlight = true;
    let coverage: NewtonCoverage | null = null;
    try {
      const response = await getNewtonCoverage(missionId);
      if (response.status === "success" && response.data) coverage = response.data;
    } catch (error) {
      clientLogger.warning({
        logId: "pathPlanner:thunkCheckNewtonCoverage:coverageCheckFailed",
        logValue: `Newton coverage check failed for mission ${missionId}: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      coverageCheckInFlight = false;
    }
    dispatch(coverageReceived({ key, coverage }));
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
        points: [path[0], path[path.length - 1]],
        pointsTouched: false,
        params: { slopeLimit: NEWTON_DEFAULT_SLOPE_LIMIT },
        request: {
          status: "idle",
          inputSignature: null,
          traverseId: null,
          result: null,
          pathResult: null,
          error: null,
        },
      })
    );
    dispatch(setSelectedPathPlanUuid(uuid));
  }
);

const samePoints = (a: readonly AEGISPoint[], b: readonly AEGISPoint[]) =>
  a.length === b.length && a.every((point, i) => point.lat === b[i].lat && point.lng === b[i].lng);

/**
 * Called on every drag tick and on `modifyend` with the whole line: start, midpoints, goal.
 * Only the debounce sends requests.
 */
export const thunkUpdatePathPlanPoints = appCreateAsyncThunk<{
  uuid: string;
  path: AEGISPoint[];
}>("pathPlanner/updatePoints", async ({ uuid, path }, { dispatch, getState }) => {
  const plan = findPlan(getState(), uuid);
  if (!plan || path.length < 2 || samePoints(plan.points, path)) return;
  const points = path.map((point) => ({ lat: point.lat, lng: point.lng }));
  dispatch(setPathPlanInputs({ uuid, points }));
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
      dropJob(runtime);
    }
    runtimes.delete(uuid);
    dispatch(removePathPlan(uuid));
  }
);
