import { createSlice } from "@reduxjs/toolkit";

export const initialState: MapState = {
  layerControls: null,
  mousePosition: null,
  selectedRightNavItem: null,
  activeSelectedName: null,
  activeSelectedUUID: null,
  activeSelectedType: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
    },
    toggleLayerControlExpanded: (state, action: { payload: string }) => {
      state.layerControls[action.payload].expanded = !state.layerControls[action.payload].expanded;
    },
    toggleLayerControlEnabled: (state, action: { payload: string }) => {
      state.layerControls[action.payload].enabled = !state.layerControls[action.payload].enabled;
    },
    setLayerControlStyle: (
      state,
      action: { payload: { layerName: string; style: LayerControlStyle } }
    ) => {
      state.layerControls[action.payload.layerName].style = action.payload.style;
    },
    setSelectedRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setActiveSelectedType: (state, action: { payload: string }) => {
      state.activeSelectedType = action.payload;
    },
    setActiveSelectedName: (state, action: { payload: string }) => {
      state.activeSelectedName = action.payload;
    },
    setActiveSelectedUUID: (state, action: { payload: string }) => {
      state.activeSelectedUUID = action.payload;
    },
  },
});

export const {
  setLayerControls,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  setLayerControlStyle,
  setSelectedRightNavItem,
  setActiveSelectedName,
  setActiveSelectedUUID,
  setActiveSelectedType,
} = mapSlice.actions;

export default mapSlice.reducer;
