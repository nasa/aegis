import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

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
    setStations: (state, action: { payload: Station[] }) => {
      state.stations = action.payload;
    },
    setStationsFromDb: (state, action: { payload: Station[] }) => {
      state.stationsFromDb = action.payload;
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
      state.stations.push(action.payload);
      // turn on edit mode for the new station
      state.stationsEditing.push(action.payload.uuid);
      // select the newly created station
      state.selectedStationUuid = action.payload.uuid;
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
    updateWalkbackPath: (
      state,
      action: {
        payload: {
          uuid: string;
          walkbackPath: AEGISPoint[];
          walkbackPathSegmentDistances: number[];
          walkbackPathSegmentElevations?: number[][];
        };
      }
    ) => {
      const station = state.stations.find((station) => station.uuid === action.payload.uuid);
      if (station) {
        station.walkbackPath = action.payload.walkbackPath;
        station.walkbackPathSegmentDistances = action.payload.walkbackPathSegmentDistances;
        if (action.payload.walkbackPathSegmentElevations) {
          station.walkbackPathSegmentElevations = action.payload.walkbackPathSegmentElevations;
        }
      }
    },
    revertWalkbackPath: (state, action: { payload: { uuid: string } }) => {
      const station = state.stations.find((station) => station.uuid === action.payload.uuid);
      const stationFromDb = state.stationsFromDb.find(
        (station) => station.uuid === action.payload.uuid
      );
      if (station && stationFromDb) {
        station.walkbackPath = stationFromDb.walkbackPath;
        station.walkbackPathSegmentDistances = stationFromDb.walkbackPathSegmentDistances;
        station.walkbackPathSegmentElevations = stationFromDb.walkbackPathSegmentElevations;
      }
    },
    deleteStationWalkbackElevation: (state, action: { payload: string }) => {
      const station = state.stations.find((station) => station.uuid === action.payload);
      if (station) {
        station.walkbackPathSegmentElevations = [];
      }
    },
  },
});

export const {
  upsertStation,
  upsertStations,
  setStations,
  setStationsFromDb,
  deleteStation,
  upsertStationsFromDb,
  deleteAllStations,
  deleteAllStationsFromDb,
  setSelectedStationRightNavItem,
  setSelectedStationUuid,
  duplicateStation,
  setStationEditMode,
  updateWalkbackPath,
  revertWalkbackPath,
  deleteStationWalkbackElevation,
} = stationSlice.actions;
