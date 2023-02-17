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
      if (action.payload.editMode) {
        state.stationsEditing.push(action.payload.stationUuid);
      } else {
        state.stationsEditing = state.stationsEditing.filter(
          (uuid) => uuid !== action.payload.stationUuid
        );
      }
    },
    updateStationLocation: (state, action: { payload: { uuid: string; location: AEGISPoint } }) => {
      state.stations = state.stations.map((station) => {
        if (station.uuid === action.payload.uuid) {
          return { ...station, location: action.payload.location };
        }
        return station;
      });
    },
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
  updateStationLocation,
} = stationSlice.actions;
