import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";
import { v4 as uuidv4 } from "uuid";

export const initialState: StationState = {
  stations: [],
  stationsFromDb: [],
  selectedStationUuid: null,
  selectedRightNavItem: "info_panel",
  stationsEditing: [],
};

export const stationSlice = createSlice({
  name: "station",
  initialState,
  reducers: {
    upsertStation: (state, action: { payload: Station }) => {
      upsertToArrayByUuid(state.stations, action.payload);
    },
    upsertStations: (state, action: { payload: Station[] }) => {
      action.payload.forEach((station) => upsertToArrayByUuid(state.stations, station));
    },
    upsertStationsFromDb: (state, action: { payload: Station[] }) => {
      action.payload.forEach((station) => upsertToArrayByUuid(state.stationsFromDb, station));
    },
    deleteStation: (state, action: { payload: Station }) => {
      state.stations = state.stations.filter((station) => station.uuid !== action.payload.uuid);
    },
    deleteAllStations: (state) => {
      state.stations = [];
    },
    deleteAllStationsFromDb: (state) => {
      state.stationsFromDb = [];
    },
    setSelectedStationRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedStationUuid: (state, action: { payload: string }) => {
      state.selectedStationUuid = action.payload;
    },

    duplicateStation: (state, action: { payload: Station }) => {
      const newStation: Station = {
        ...action.payload,
        uuid: uuidv4(),
        name: action.payload.name + " (copy)",
      };
      state.stations.push(newStation);
      // turn on edit mode for the new station
      state.stationsEditing.push(newStation.uuid);
      // select the newly created station
      state.selectedStationUuid = newStation.uuid;
    },
    setStationEditMode: (
      state,
      action: { payload: { stationUuid: string; editMode: boolean } }
    ) => {
      const station = state.stations.find((station) => station.uuid === action.payload.stationUuid);
      if (station) {
        if (action.payload.editMode) {
          state.stationsEditing.push(station.uuid);
        } else {
          state.stationsEditing = state.stationsEditing.filter((uuid) => uuid !== station.uuid);
        }
      }
    },

    // insertStationPois: (state, action: { payload: StationPoi[] }) => {
    //   action.payload.forEach((stationpoi_payload) => {
    //     //if record doesn't exist, add it.
    //     if (
    //       state.stationsPois.findIndex((stationpoi_state) => {
    //         stationpoi_state.poiUuid === stationpoi_payload.poiUuid &&
    //           stationpoi_state.stationUuid === stationpoi_state.stationUuid;
    //       }) === -1
    //     ) {
    //       state.stationsPois.push(stationpoi_payload);
    //     }
    //   });
    // },
    // deleteStationPoi: (state, action: { payload: StationPoi }) => {
    //   const index = state.stationsPois.findIndex((stationpoi_state) => {
    //     stationpoi_state.poiUuid === action.payload.poiUuid &&
    //       stationpoi_state.stationUuid === action.payload.stationUuid;
    //   });
    //   if (index >= 0) state.stationsPois.splice(index, 1);
    // },
    // deleteAllStationPois: (state) => {
    //   state.stationsPois = [];
    // },
  },
});

export const {
  upsertStation,
  upsertStations,
  deleteStation,
  upsertStationsFromDb,
  deleteAllStations,
  deleteAllStationsFromDb,
  setSelectedStationRightNavItem,
  setSelectedStationUuid,
  duplicateStation,
  setStationEditMode,
} = stationSlice.actions;
