import { createSlice } from "@reduxjs/toolkit";

export const initialState: STMState = {
  objectives: [],
  goals: [],
  investigations: [],
};

export const stmSlice = createSlice({
  name: "stm",
  initialState,
  reducers: {
    /** Add new day night to the store */
    setObjectives: (state, action: { payload: STMObjective[] }) => {
      state.objectives = action.payload;
    },
    setGoals: (state, action: { payload: STMGoal[] }) => {
      state.goals = action.payload;
    },
    setInvestigations: (state, action: { payload: STMInvestigation[] }) => {
      state.investigations = action.payload;
    },
  },
});

export const { setObjectives, setGoals, setInvestigations } = stmSlice.actions;
