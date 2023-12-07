import { createSlice } from "@reduxjs/toolkit";

export const initialState: STMState = {
  objectives: [],
  goals: [],
  investigations: [],
  loadingStatus: "unloaded",
};

export const stmSlice = createSlice({
  name: "stm",
  initialState,
  reducers: {
    /* only called for populating store  */
    setObjectives: (state, action: { payload: STMObjective[] }) => {
      state.objectives = action.payload;
    },
    /* only called for populating store  */
    setGoals: (state, action: { payload: STMGoal[] }) => {
      state.goals = action.payload;
    },
    /* only called for populating store  */
    setInvestigations: (state, action: { payload: STMInvestigation[] }) => {
      state.investigations = action.payload;
    },
    setStmLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
  },
});

export const { setObjectives, setGoals, setInvestigations, setStmLoadingStatus } = stmSlice.actions;
