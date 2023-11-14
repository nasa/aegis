import { createSlice } from "@reduxjs/toolkit";

export const initialState: HoverState = {
  timelineSeqItemUuid: null,
  leftPanelHoverItemUuid: null,
  mapItemUuid: null,
  crewPosItemUuid: null,
  evaSecondsElapsed: null,
  sequenceItemPercentElapsed: null,
};

export const hoverSlice = createSlice({
  name: "hover",
  initialState,
  reducers: {
    /**
     * Change the seconds the cursor is hovering on via the timeline
     * Also change the sequence UUID that is currently being hovered over
     */

    setTimelineHoverUuid: (state, action: { payload: string }) => {
      state.timelineSeqItemUuid = action.payload;
    },
    setLeftPanelHoverUuid: (state, action: { payload: string }) => {
      state.leftPanelHoverItemUuid = action.payload;
    },
    setMapItemHoverUuid: (state, action: { payload: string }) => {
      state.mapItemUuid = action.payload;
    },
    setCrewPosItemHoverUuid: (state, action: { payload: string }) => {
      state.crewPosItemUuid = action.payload;
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
      state.sequenceItemPercentElapsed = null;
      state.mapItemUuid = null;
      state.crewPosItemUuid = null;
      state.leftPanelHoverItemUuid = null;
      state.timelineSeqItemUuid = null;
    },
    setHoverUuidsForSequence: (state, action: { payload: string }) => {
      state.timelineSeqItemUuid = action.payload;
      state.leftPanelHoverItemUuid = action.payload;
      state.mapItemUuid = action.payload;
    },
    setHoverUuidsForCrewPos: (state, action: { payload: string }) => {
      state.crewPosItemUuid = action.payload;
      state.timelineSeqItemUuid = action.payload;
      state.mapItemUuid = action.payload;
    },
  },
});

export const {
  setTimelineHoverUuid,
  setLeftPanelHoverUuid,
  setMapItemHoverUuid,
  setCrewPosItemHoverUuid,
  setMapItemHover,
  clearMapItemHover,
  setHoverUuidsForSequence,
  setHoverUuidsForCrewPos,
} = hoverSlice.actions;
