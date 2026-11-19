import { createSlice } from "@reduxjs/toolkit";

export const initialState: PathPlannerState = {
  plans: [],
  selectedPlanUuid: null,
  coverage: { key: null, status: "idle", coverage: null },
};

const findPlan = (state: PathPlannerState, uuid: string) =>
  state.plans.find((plan) => plan.uuid === uuid);

export const pathPlannerSlice = createSlice({
  name: "pathPlanner",
  initialState,
  reducers: {
    addPathPlan: (state, action: { payload: PathPlan }) => {
      state.plans.push(action.payload);
    },
    removePathPlan: (state, action: { payload: string }) => {
      state.plans = state.plans.filter((plan) => plan.uuid !== action.payload);
      if (state.selectedPlanUuid === action.payload) state.selectedPlanUuid = null;
    },
    setSelectedPathPlanUuid: (state, action: { payload: string | null }) => {
      state.selectedPlanUuid = action.payload;
    },
    setPathPlanColor: (state, action: { payload: { uuid: string; color: string } }) => {
      const plan = findPlan(state, action.payload.uuid);
      if (plan) plan.color = action.payload.color;
    },
    /**
     * New points or params; the old result stays so it can be drawn as stale. Planning waits
     * (`idle`) until the user has moved a point.
     */
    setPathPlanInputs: (
      state,
      action: {
        payload: {
          uuid: string;
          points?: AEGISPoint[];
          params?: NewtonTraverseParams;
        };
      }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      if (!plan) return;
      if (action.payload.points) {
        plan.points = action.payload.points;
        plan.pointsTouched = true;
      }
      if (action.payload.params) plan.params = action.payload.params;
      plan.request.status = plan.pointsTouched ? "debouncing" : "idle";
      plan.request.inputSignature = null;
      plan.request.traverseId = null;
      plan.request.error = null;
    },
    pathPlanIdle: (state, action: { payload: string }) => {
      const plan = findPlan(state, action.payload);
      if (!plan) return;
      plan.request = {
        status: "idle",
        inputSignature: null,
        traverseId: null,
        result: null,
        pathResult: plan.request.pathResult,
        error: null,
      };
    },
    pathPlanRequestStarted: (
      state,
      action: { payload: { uuid: string; inputSignature: string } }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      if (!plan) return;
      plan.request.status = "pending";
      plan.request.inputSignature = action.payload.inputSignature;
      plan.request.traverseId = null;
      plan.request.error = null;
    },
    pathPlanSubmitted: (
      state,
      action: { payload: { uuid: string; inputSignature: string; traverseId: string } }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      if (!plan || plan.request.inputSignature !== action.payload.inputSignature) return;
      plan.request.traverseId = action.payload.traverseId;
    },
    /** Ignored unless it is for the request now in progress, like `terrainProfileReceived`. */
    pathPlanResultReceived: (
      state,
      action: { payload: { uuid: string; result: PathPlanResult } }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      const { result } = action.payload;
      if (!plan || plan.request.inputSignature !== result.inputSignature) return;
      if (plan.request.traverseId !== result.traverseId) return;
      plan.request.result = result;
      if (result.status === "succeeded" && (result.path?.length ?? 0) >= 2)
        plan.request.pathResult = result;
      const finished =
        result.status === "succeeded" ||
        result.status === "failed" ||
        result.status === "cancelled";
      plan.request.status = finished ? "ready" : "pending";
    },
    pathPlanRequestFailed: (
      state,
      action: { payload: { uuid: string; inputSignature: string | null; error: PathPlanError } }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      if (!plan || plan.request.inputSignature !== action.payload.inputSignature) return;
      plan.request.status = "error";
      plan.request.error = action.payload.error;
    },
    coverageCheckStarted: (state, action: { payload: string }) => {
      state.coverage = { key: action.payload, status: "checking", coverage: null };
    },
    coverageReceived: (
      state,
      action: { payload: { key: string; coverage: NewtonCoverage | null } }
    ) => {
      if (state.coverage.key !== action.payload.key) return;
      state.coverage.status = action.payload.coverage ? "ready" : "error";
      state.coverage.coverage = action.payload.coverage;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const {
  addPathPlan,
  removePathPlan,
  setSelectedPathPlanUuid,
  setPathPlanColor,
  setPathPlanInputs,
  pathPlanIdle,
  pathPlanRequestStarted,
  pathPlanSubmitted,
  pathPlanResultReceived,
  pathPlanRequestFailed,
  coverageCheckStarted,
  coverageReceived,
  obliterateState,
} = pathPlannerSlice.actions;
