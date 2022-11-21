import { createSlice } from "@reduxjs/toolkit";

export const initialState: STMState = {
  loadingStatus: "LOADING",
  mission: "",
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
    addObjective: (state, action: { payload: STMObjective }) => {
      state.objectives.push(action.payload);
    },
    delObjective: (state, action: { payload: String }) => {
      const index = state.objectives.findIndex((obj) => obj.uuid === action.payload);
      if (index >= 0) {
        state.objectives.splice(index, 1); //delete this item from the array
      }
    },

    setGoals: (state, action: { payload: STMGoal[] }) => {
      state.goals = action.payload;
    },
    addGoal: (state, action: { payload: STMGoal }) => {
      state.goals.push(action.payload);
    },
    delGoal: (state, action: { payload: String }) => {
      const index = state.goals.findIndex((obj) => obj.uuid === action.payload);
      if (index >= 0) {
        state.goals.splice(index, 1); //delete this item from the array
      }
    },

    setInvestigations: (state, action: { payload: STMInvestigation[] }) => {
      state.investigations = action.payload;
    },
    addInvestigation: (state, action: { payload: STMInvestigation }) => {
      state.investigations.push(action.payload);
    },
    delInvestigation: (state, action: { payload: String }) => {
      const index = state.investigations.findIndex((obj) => obj.uuid === action.payload);
      if (index >= 0) {
        state.investigations.splice(index, 1); //delete this item from the array
      }
    },

    clearSTM: (state) => {
      state.objectives = [];
      state.goals = [];
      state.investigations = [];
    },
    setSTMLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
  },
});

export const {
  setObjectives,
  addObjective,
  delObjective,
  setGoals,
  addGoal,
  delGoal,
  setInvestigations,
  addInvestigation,
  delInvestigation,
  clearSTM,
  setSTMLoadingStatus,
} = stmSlice.actions;
