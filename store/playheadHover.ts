import { createSlice } from "@reduxjs/toolkit";

export const initialState: PlayheadHoverState = {
  seconds: null,
  sequenceItemUuid: null,
  sequenceItemPercentElapsed: null,
  itemUuid: null,
};

export const playheadHoverSlice = createSlice({
  name: "playheadHover",
  initialState,
  reducers: {
    /**
     * Change the seconds the cursor is hovering on via the nav-timeline
     * Also change the sequence UUID that is currently being hovered over
     */
    setHover: (
      state,
      action: {
        payload: { seconds: number; sequenceUuid: string; sequenceItemPercentElapsed: number };
      }
    ) => {
      state.seconds = action.payload.seconds;
      state.sequenceItemUuid = action.payload.sequenceUuid;
      state.sequenceItemPercentElapsed = action.payload.sequenceItemPercentElapsed;
    },

    clearHover: (state) => {
      state.seconds = null;
      state.sequenceItemUuid = null;
      state.sequenceItemPercentElapsed = null;
    },
    setHoverItemUuid: (state, action: { payload: string }) => {
      state.itemUuid = action.payload;
    },
  },
});

export const { setHover, clearHover, setHoverItemUuid } = playheadHoverSlice.actions;
