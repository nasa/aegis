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
    updateStationLocationAndElevation: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint; elevation: number } }
    ) => {
      state.stations = state.stations.map((station) => {
        if (station.uuid === action.payload.uuid) {
          // set the first point of the walkback location to the new station location
          const walkbackLocation = station.walkbackPath;
          if (station.walkbackPath && station.walkbackPath.length > 0) {
            station.walkbackPath[0] = action.payload.location;
          }
          return {
            ...station,
            location: action.payload.location,
            elevation: action.payload.elevation,
            walkbackPath: walkbackLocation,
          };
        }
        return station;
      });
    },
    updateWalkbackPathAndDistance: (
      state,
      action: { payload: { uuid: string; path: AEGISPoint[]; distance: number[] } }
    ) => {
      state.stations = state.stations.map((station) => {
        if (station.uuid === action.payload.uuid) {
          return {
            ...station,
            walkbackPath: action.payload.path,
            walkbackPathSegmentDistances: action.payload.distance,
          };
        }
        return station;
      });
    },
    revertWalkbackPathAndDistance: (state, action: { payload: { uuid: string } }) => {
      const station = state.stations.find((station) => station.uuid === action.payload.uuid);
      const stationFromDb = state.stationsFromDb.find(
        (station) => station.uuid === action.payload.uuid
      );
      if (station && stationFromDb) {
        station.walkbackPath = stationFromDb.walkbackPath;
        station.walkbackPathSegmentDistances = stationFromDb.walkbackPathSegmentDistances;
      }
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
  updateStationLocationAndElevation,
  updateWalkbackPathAndDistance,
  revertWalkbackPathAndDistance,
} = stationSlice.actions;
