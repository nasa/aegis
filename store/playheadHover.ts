import { createSlice } from "@reduxjs/toolkit";

export const initialState: PlayheadHoverState = {
  timelineSeqItemUuid: null,
  leftPanelItemUuid: null,
  mapItemUuid: null,
  evaSecondsElapsed: null,
  sequenceItemPercentElapsed: null,
};

export const playheadHoverSlice = createSlice({
  name: "playheadHover",
  initialState,
  reducers: {
    /**
     * Change the seconds the cursor is hovering on via the nav-timeline
     * Also change the sequence UUID that is currently being hovered over
     */

    setTimelineHoverUuid: (state, action: { payload: string }) => {
      state.timelineSeqItemUuid = action.payload;
    },
    setLeftPanelHoverUuid: (state, action: { payload: string }) => {
      state.leftPanelItemUuid = action.payload;
    },
    setMapItemHoverUuid: (state, action: { payload: string }) => {
      state.mapItemUuid = action.payload;
    },
    setMapItemHover: (
      state,
      action: {
        payload: { seconds: number; sequenceUuid: string; sequenceItemPercentElapsed: number };
      }
    ) => {
      state.evaSecondsElapsed = action.payload.seconds;
      state.mapItemUuid = action.payload.sequenceUuid;
      state.sequenceItemPercentElapsed = action.payload.sequenceItemPercentElapsed;
    },
    clearMapItemHover: (state) => {
      state.evaSecondsElapsed = null;
      state.mapItemUuid = null;
      state.sequenceItemPercentElapsed = null;
    },
  },
});

export const {
  setTimelineHoverUuid,
  setLeftPanelHoverUuid,
  setMapItemHoverUuid,
  setMapItemHover,
  clearMapItemHover,
} = playheadHoverSlice.actions;
