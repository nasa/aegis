import { createSlice } from "@reduxjs/toolkit";

export const initialState: MissionState = {
  mission: null,
  layers: null,
  presets: null,
  userInterface: null,
};

export const missionSlice = createSlice({
  name: "mission",
  initialState,
  reducers: {
    setMission: (state, action: { payload: Mission }) => {
      state.mission = action.payload;
    },
    setLayers: (state, action: { payload: Layer[] }) => {
      state.layers = action.payload;
    },
    setPresets: (state, action: { payload: Preset[] }) => {
      state.presets = action.payload;
    },
    setInterface: (state, action: { payload: UserInterface }) => {
      state.userInterface = action.payload;
    },
  },
});

export const { setMission, setLayers, setPresets } = missionSlice.actions;
