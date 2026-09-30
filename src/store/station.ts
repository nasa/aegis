import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: StationState = {
  selectedStationUuid: null,
  selectedRightNavItem: "info_panel",
  stationCirclesUIStates: {},
};

export const stationSlice = createSlice({
  name: "station",
  initialState,
  reducers: {
    setSelectedStationRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedStationUuid: (state, action: { payload: string }) => {
      state.selectedStationUuid = action.payload;
    },
    selectStation: (state, action: { payload: { uuid: string } }) => {
      state.selectedStationUuid = action.payload.uuid; // select the newly created station
      state.selectedRightNavItem = "info_panel";
    },

    /**
     * Station Circle UI States
     */
    setAllStationCirclesUIStates: (
      state,
      action: { payload: { circlesUIStates: CirclesUIStates } }
    ) => {
      state.stationCirclesUIStates = action.payload.circlesUIStates;
    },
    setStationCircleUIStates: (
      state,
      action: {
        payload: {
          stationUuid: string;
          circleUIStates: CircleUIStates;
        };
      }
    ) => {
      state.stationCirclesUIStates[action.payload.stationUuid] = action.payload.circleUIStates;
    },
    setStationCircleUIState: (
      state,
      action: {
        payload: {
          stationUuid: string;
          circleDefUuid: string;
          circleUIState: CircleUIState;
        };
      }
    ) => {
      state.stationCirclesUIStates[action.payload.stationUuid][action.payload.circleDefUuid] =
        action.payload.circleUIState;
    },
    resetAllStationCirclesUIStates: (state, action: { payload: { stationUuid: string } }) => {
      // set all tabSelected values to null
      Object.keys(state.stationCirclesUIStates[action.payload.stationUuid]).forEach((uuid) => {
        state.stationCirclesUIStates[action.payload.stationUuid][uuid].slidersSelected = false;
      });
    },

    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.station);
    });
  },
});

export const {
  setSelectedStationRightNavItem,
  setSelectedStationUuid,
  selectStation,
  setAllStationCirclesUIStates,
  setStationCircleUIStates,
  setStationCircleUIState,
  resetAllStationCirclesUIStates,
  obliterateState,
} = stationSlice.actions;
