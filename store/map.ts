import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: MapState = {
  layerControls: null,
  activeSelectedName: null,
  mousePosition: null,
  userMapObjects: [],
};

export const mapSlice = createSlice({
  name: "map",
  initialState,
  reducers: {
    setLayerControls: (state, action: { payload: LayerControls }) => {
      state.layerControls = action.payload;
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
    setActiveSelectedName: (state, action: { payload: string }) => {
      state.activeSelectedName = action.payload;
    },
    upsertUserMapObject: (state, action: { payload: UserMapObject }) => {
      upsertToArrayByUuid(state.userMapObjects, action.payload);
    },
    deleteUserMapObject: (state, action: { payload: UserMapObject }) => {
      state.userMapObjects = state.userMapObjects.filter(
        (userMapObject) => userMapObject.uuid !== action.payload.uuid
      );
    },
  },
});

export const {
  setLayerControls,
  toggleLayerControlEnabled,
  setLayerControlStyle,
  setActiveSelectedName,
  upsertUserMapObject,
  deleteUserMapObject,
} = mapSlice.actions;

export default mapSlice.reducer;
