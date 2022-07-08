import { createSlice } from "@reduxjs/toolkit";
import { IronSessionData } from "iron-session";

export const initialState: UserState = {
  isLoggedIn: false,
  ironSessionData: null,
  layerControls: null,
};

export const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    setIsLoggedIn: (state, action: { payload: boolean }) => {
      state.isLoggedIn = action.payload;
    },
    setIronSessionData: (state, action: { payload: IronSessionData }) => {
      state.ironSessionData = action.payload;
    },
    clearIronSessionData: (state) => {
      state.ironSessionData = null;
    },
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
    },
    toggleLayerControlExpanded: (state, action: { payload: string }) => {
      state.layerControls[action.payload].expanded = !state.layerControls[action.payload].expanded;
    },
    toggleLayerControlEnabled: (state, action: { payload: string }) => {
      state.layerControls[action.payload].enabled = !state.layerControls[action.payload].enabled;
    },
  },
});

export const {
  setIsLoggedIn,
  setIronSessionData,
  clearIronSessionData,
  setLayerControls,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
} = userSlice.actions;
