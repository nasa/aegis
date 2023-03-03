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
    updateStationLocation: (state, action: { payload: { uuid: string; location: AEGISPoint } }) => {
      state.stations = state.stations.map((station) => {
        if (station.uuid === action.payload.uuid) {
          // set the first point of the walkback location to the new station location
          const walkbackLocation = station.walkbackLocation;
          if (station.walkbackLocation && station.walkbackLocation.length > 0) {
            station.walkbackLocation[0] = action.payload.location;
          }
          return { ...station, location: action.payload.location, walkbackLocation };
        }
        return station;
      });
    },
    updateWalkbackLocationAndDistance: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint[]; distance: number[] } }
    ) => {
      state.stations = state.stations.map((station) => {
        if (station.uuid === action.payload.uuid) {
          return {
            ...station,
            walkbackLocation: action.payload.location,
            walkbackDistance: action.payload.distance,
          };
        }
        return station;
      });
    },
    revertWalkbackLocationAndDistance: (state, action: { payload: { uuid: string } }) => {
      const station = state.stations.find((station) => station.uuid === action.payload.uuid);
      const stationFromDb = state.stationsFromDb.find(
        (station) => station.uuid === action.payload.uuid
      );
      if (station && stationFromDb) {
        station.walkbackLocation = stationFromDb.walkbackLocation;
        station.walkbackDistance = stationFromDb.walkbackDistance;
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
  updateStationLocation,
  updateWalkbackLocationAndDistance,
  revertWalkbackLocationAndDistance,
} = stationSlice.actions;
