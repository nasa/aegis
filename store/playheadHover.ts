import { createSlice } from "@reduxjs/toolkit";

export const initialState: PlayheadHoverState = {
  seconds: 0,
  itemUuid: null,
};

export const playheadHoverSlice = createSlice({
  name: "playheadHover",
  initialState,
  reducers: {
    /**
     * Change the date the cursor is hovering on via the nav-timeline
     */
    changeHoverTime: (state, action: { payload: number }) => {
      state.seconds = action.payload;
    },
    setHoverItemUuid: (state, action: { payload: string }) => {
      state.itemUuid = action.payload;
    },
  },
});

export const { changeHoverTime, setHoverItemUuid } = playheadHoverSlice.actions;
