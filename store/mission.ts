import { createSlice } from "@reduxjs/toolkit";
import { Preset } from "../server/database/models/preset.model";

export const initialState: MissionState = {
  Mission: null,
  Layers: null,
  Presets: null,
  UserInterface: null,
};

export const missionSlice = createSlice({
  name: "missionSlice",
  initialState,
  reducers: {
    setMission: (state, action: { payload: AEGISMission }) => {
      state.Mission = action.payload;
    },
    setLayers: (state, action: { payload: LayerModel[] }) => {
      state.Layers = action.payload;
    },
    setPresets: (state, action: { payload: Preset[] }) => {
      state.Presets = action.payload;
    },
    setInterface: (state, action: { payload: UserInterface }) => {
      state.UserInterface = action.payload;
    },
  },
});

export const { setMission, setLayers } = missionSlice.actions;
