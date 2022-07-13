import { createSlice } from "@reduxjs/toolkit";
import { IronSessionData } from "iron-session";
import { LatLng } from "leaflet";

export const initialState: MapState = {
  layerControls: null,
  drawLayers: [],
  mousePosition: null,
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
    },
    setLayerOpacity: (state, action: { payload: { layerName: string; opacity: number } }) => {
      state.layerControls[action.payload.layerName].opacity = action.payload.opacity;
    },
    toggleLayerControlExpanded: (state, action: { payload: string }) => {
      state.layerControls[action.payload].expanded = !state.layerControls[action.payload].expanded;
    },
    toggleLayerControlEnabled: (state, action: { payload: string }) => {
      state.layerControls[action.payload].enabled = !state.layerControls[action.payload].enabled;
    },
    addDrawLayer: (state, action: { payload: DrawLayer }) => {
      state.drawLayers = [...state.drawLayers, action.payload];
    },
    updateDrawLayer: (state, action: { payload: DrawLayer }) => {
      state.drawLayers = state.drawLayers.map((drawLayer) => {
        if (drawLayer.uuid === action.payload.uuid) {
          return action.payload;
        }
        return drawLayer;
      });
    },
    // replaceAllDrawLayers: (state, action: { payload: DrawLayer[] }) => {
    //   state.drawLayers = action.payload;
    // },
  },
});

export const {
  setLayerControls,
  setLayerOpacity,
  toggleLayerControlExpanded,
  toggleLayerControlEnabled,
  addDrawLayer,
  updateDrawLayer,
  // replaceAllDrawLayers,
} = mapSlice.actions;
