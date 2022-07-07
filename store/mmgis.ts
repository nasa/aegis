import { createSlice } from "@reduxjs/toolkit";

export const initialState: MMGISState = {
  MMGISConfig: null,
  MMGISConfigs: null,
};

export const mmgisConfigSlice = createSlice({
  name: "mmgisConfig",
  initialState,
  reducers: {
    setMMGISConfig: (state, action: { payload: MMGISConfig }) => {
      state.MMGISConfig = action.payload;
    },
  },
});

export const { setMMGISConfig } = mmgisConfigSlice.actions;
