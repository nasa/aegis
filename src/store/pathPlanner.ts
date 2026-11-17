import { createSlice } from "@reduxjs/toolkit";

export const initialState: PathPlannerState = {
  plans: [],
  selectedPlanUuid: null,
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
     * New points or params; the old row stays so it can be drawn as stale. Planning waits
     * (`idle`) until the user has moved a point.
     */
    setPathPlanInputs: (
      state,
      action: {
        payload: {
          uuid: string;
          start?: AEGISPoint;
          goal?: AEGISPoint;
          params?: NewtonTraverseParams;
        };
      }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      if (!plan) return;
      if (action.payload.start) plan.start = action.payload.start;
      if (action.payload.goal) plan.goal = action.payload.goal;
      if (action.payload.start || action.payload.goal) plan.pointsTouched = true;
      if (action.payload.params) plan.params = action.payload.params;
      plan.request.status = plan.pointsTouched ? "debouncing" : "idle";
      plan.request.inputSignature = null;
      plan.request.error = null;
    },
    pathPlanIdle: (state, action: { payload: string }) => {
      const plan = findPlan(state, action.payload);
      if (!plan) return;
      plan.request = { status: "idle", inputSignature: null, row: null, error: null };
    },
    pathPlanRequestStarted: (
      state,
      action: { payload: { uuid: string; inputSignature: string } }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      if (!plan) return;
      plan.request.status = "pending";
      plan.request.inputSignature = action.payload.inputSignature;
      plan.request.error = null;
    },
    /** Ignored unless it is for the request now in progress, like `terrainProfileReceived`. */
    pathPlanRowReceived: (
      state,
      action: { payload: { uuid: string; inputSignature: string; row: NewtonTraverseRow } }
    ) => {
      const plan = findPlan(state, action.payload.uuid);
      const { inputSignature, row } = action.payload;
      if (!plan || plan.request.inputSignature !== inputSignature) return;
      if (row.inputSignature !== inputSignature) return;
      plan.request.row = row;
      const finished =
        row.status === "succeeded" || row.status === "failed" || row.status === "cancelled";
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
  pathPlanRowReceived,
  pathPlanRequestFailed,
  obliterateState,
} = pathPlannerSlice.actions;
