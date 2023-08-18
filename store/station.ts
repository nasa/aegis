import { createSlice } from "@reduxjs/toolkit";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: StationState = {
  stations: [],
  stationsFromDb: [],
  selectedStationUuid: null,
  selectedRightNavItem: "info_panel",
  stationsEditing: [],
  calculatedFields: [],
};

export const stationSlice = createSlice({
  name: "station",
  initialState,
  reducers: {
    upsertStation: {
      reducer: (state, action: { payload: Station }) => {
        upsertToArrayByUuid(state.stations, action.payload);
      },
      prepare: (station: Station, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: station };
        } else {
          return {
            payload: { ...station, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
    },
    upsertStations: {
      reducer: (state, action: { payload: Station[] }) => {
        action.payload.forEach((station) => upsertToArrayByUuid(state.stations, station));
      },
      prepare: (stations: Station[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: stations };
        } else {
          return {
            payload: stations.map((station) => ({
              ...station,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
    },
    upsertStationsFromDb: (state, action: { payload: Station[] }) => {
      action.payload.forEach((station) => upsertToArrayByUuid(state.stationsFromDb, station));
    },
    upsertStationFromDb: (state, action: { payload: Station }) => {
      upsertToArrayByUuid(state.stationsFromDb, action.payload);
    },
    /* only called for populating store  */
    setStations: (state, action: { payload: Station[] }) => {
      state.stations = action.payload;
    },
    setStationsFromDb: (state, action: { payload: Station[] }) => {
      state.stationsFromDb = action.payload;
    },
    deleteStationByUuid: (state, action: { payload: string }) => {
      state.stations = state.stations.filter((station) => station.uuid !== action.payload);
    },
    deleteStationFromDbByUuid: (state, action: { payload: string }) => {
      state.stationsFromDb = state.stationsFromDb.filter(
        (station) => station.uuid !== action.payload
      );
    },
    setSelectedStationRightNavItem: (state, action: { payload: string }) => {
      state.selectedRightNavItem = action.payload;
    },
    setSelectedStationUuid: (state, action: { payload: string }) => {
      state.selectedStationUuid = action.payload;
    },
    setStateForNewStation: (state, action: { payload: { uuid: string } }) => {
      state.stationsEditing.push(action.payload.uuid); // turn on edit mode for the new station
      state.selectedStationUuid = action.payload.uuid; // select the newly created station
      state.selectedRightNavItem = "info_panel";
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
    setStationCalculatedFields: (
      state,
      action: { payload: { calculatedFields: StationCalculatedFields[] } }
    ) => {
      state.calculatedFields = action.payload.calculatedFields;
    },
  },
});

export const {
  upsertStation,
  upsertStations,
  upsertStationsFromDb,
  upsertStationFromDb,
  setStations,
  setStationsFromDb,
  deleteStationByUuid,
  deleteStationFromDbByUuid,
  setSelectedStationRightNavItem,
  setSelectedStationUuid,
  setStateForNewStation,
  setStationEditMode,
  revertWalkbackPath,
  setStationCalculatedFields,
} = stationSlice.actions;
