import { createSlice } from "@reduxjs/toolkit";

export const initialState: HoverState = {
  timelineSeqItemUuid: null,
  leftPanelHoverItemUuid: null,
  mapItemUuid: null,
  mapItemType: null,
  posEntryItemUuid: null,
  sequenceItemPercentElapsed: null,
  measurementUuid: null,
  measurementPercentDistance: null,
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
    setSequenceHover: (
      state,
      action: {
        payload: {
          sequenceUuid: string;
          sequenceItemPercentElapsed: number;
          mapItemType: MapItemType;
        };
      }
    ) => {
      state.mapItemUuid = action.payload.sequenceUuid;
      state.mapItemType = action.payload.mapItemType;
      state.sequenceItemPercentElapsed = action.payload.sequenceItemPercentElapsed;
    },
    setMeasurementHover: (
      state,
      action: { payload: { measurementUuid: string; measurementPercentDistance: number } }
    ) => {
      state.measurementUuid = action.payload.measurementUuid;
      state.measurementPercentDistance = action.payload.measurementPercentDistance;
    },
    clearMapItemHover: (state) => {
      state.sequenceItemPercentElapsed = null;
      state.mapItemUuid = null;
      state.mapItemType = null;
      state.posEntryItemUuid = null;
      state.leftPanelHoverItemUuid = null;
      state.timelineSeqItemUuid = null;
      state.measurementUuid = null;
      state.measurementPercentDistance = null;
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
  setSequenceHover,
  setMeasurementHover,
  clearMapItemHover,
  setHoverUuidsForSequence,
  setHoverUuidsForPosEntry,
  obliterateState,
} = hoverSlice.actions;
