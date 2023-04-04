import { createSlice } from "@reduxjs/toolkit";

export const initialState: PlayheadHoverState = {
  seconds: null,
  timelineSeqItemUuid: null,
  timelineSeqItemPctElapsed: null,
  leftPanelItemUuid: null,
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
      state.timelineSeqItemUuid = action.payload.sequenceUuid;
      state.timelineSeqItemPctElapsed = action.payload.sequenceItemPercentElapsed;
    },

    clearHover: (state) => {
      state.seconds = null;
      state.timelineSeqItemUuid = null;
      state.timelineSeqItemPctElapsed = null;
    },
    setHoverItemUuid: (state, action: { payload: string }) => {
      state.leftPanelItemUuid = action.payload;
    },
  },
});

export const { setHover, clearHover, setHoverItemUuid } = playheadHoverSlice.actions;
