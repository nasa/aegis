import { createSlice } from "@reduxjs/toolkit";

export const initialState: HoverState = {
  timelineSeqItemUuid: null,
  leftPanelHoverItemUuid: null,
  mapItemUuid: null,
  mapItemType: null,
  posEntryItemUuid: null,
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
    setMapItemHoverType: (state, action: { payload: MapItemType }) => {
      state.mapItemType = action.payload;
    },
    setPosEntryItemHoverUuid: (state, action: { payload: string }) => {
      state.posEntryItemUuid = action.payload;
    },
    setMapItemHover: (
      state,
      action: {
        payload: {
          seconds: number;
          sequenceUuid: string;
          mapItemType: MapItemType;
          sequenceItemPercentElapsed: number;
        };
      }
    ) => {
      state.evaSecondsElapsed = action.payload.seconds;
      state.mapItemUuid = action.payload.sequenceUuid;
      state.mapItemType = action.payload.mapItemType;
      state.sequenceItemPercentElapsed = action.payload.sequenceItemPercentElapsed;
    },
    clearMapItemHover: (state) => {
      state.evaSecondsElapsed = null;
      state.sequenceItemPercentElapsed = null;
      state.mapItemUuid = null;
      state.mapItemType = null;
      state.posEntryItemUuid = null;
      state.leftPanelHoverItemUuid = null;
      state.timelineSeqItemUuid = null;
    },
    setHoverUuidsForSequence: (
      state,
      action: { payload: { sequenceUuid: string; mapItemType: MapItemType } }
    ) => {
      state.timelineSeqItemUuid = action.payload.sequenceUuid;
      state.leftPanelHoverItemUuid = action.payload.sequenceUuid;
      state.mapItemUuid = action.payload.sequenceUuid;
      state.mapItemType = action.payload.mapItemType;
    },
    setHoverUuidsForPosEntry: (state, action: { payload: string }) => {
      state.posEntryItemUuid = action.payload;
      state.timelineSeqItemUuid = action.payload;
      state.mapItemUuid = action.payload;
      state.mapItemType = "posEntry";
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const {
  setTimelineHoverUuid,
  setLeftPanelHoverUuid,
  setMapItemHoverType,
  setMapItemHoverUuid,
  setPosEntryItemHoverUuid,
  setMapItemHover,
  clearMapItemHover,
  setHoverUuidsForSequence,
  setHoverUuidsForPosEntry,
  obliterateState,
} = hoverSlice.actions;
