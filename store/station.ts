import { createSlice } from "@reduxjs/toolkit";
import { cloneDeep } from "lodash";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: StationState = {
  stations: [],
  stationsFromDb: [],
  selectedStationUuid: null,
  selectedRightNavItem: "info_panel",
  stationsEditing: [],
  calculatedFields: [],
  loadingStatus: "unloaded",
};

export const stationSlice = createSlice({
  name: "station",
  initialState,
  reducers: {
    upsertStation: {
      prepare: (station: Station, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: station };
        } else {
          return {
            payload: { ...station, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
      reducer: (state, action: { payload: Station }) => {
        upsertToArrayByUuid(state.stations, action.payload);
      },
    },
    upsertStations: {
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
      reducer: (state, action: { payload: Station[] }) => {
        action.payload.forEach((station) => upsertToArrayByUuid(state.stations, station));
      },
    },
    upsertStationsFromDb: (state, action: { payload: Station[] }) => {
      action.payload.forEach((station) => upsertToArrayByUuid(state.stationsFromDb, station));
    },
    upsertStationFromDb: (state, action: { payload: Station }) => {
      upsertToArrayByUuid(state.stationsFromDb, action.payload);
    },
    upsertStationByField: {
      prepare: (
        stationUuid: string,
        fieldName: keyof Station,
        value: Station[keyof Station],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { stationUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              stationUuid,
              fieldName,
              value,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: {
          payload: {
            stationUuid: string;
            fieldName: keyof Station;
            value: Station[keyof Station];
            updatedAt: string;
          };
        }
      ) => {
        const station = state.stations.find((s) => s.uuid === action.payload.stationUuid);
        const newStation: Station = cloneDeep(station);
        newStation.updatedAt = action.payload.updatedAt || station.updatedAt;
        const key = action.payload.fieldName;
        (newStation as Record<typeof key, Station[keyof Station]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.stations, newStation);
      },
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
    deleteStationsByUuid: (state, action: { payload: string[] }) => {
      state.stations = state.stations.filter((station) => !action.payload.includes(station.uuid));
    },
    deleteStationsFromDbByUuid: (state, action: { payload: string[] }) => {
      state.stationsFromDb = state.stationsFromDb.filter(
        (station) => !action.payload.includes(station.uuid)
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
    setStationLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
  },
});

export const {
  upsertStation,
  upsertStations,
  upsertStationsFromDb,
  upsertStationFromDb,
  upsertStationByField,
  setStations,
  setStationsFromDb,
  deleteStationByUuid,
  deleteStationFromDbByUuid,
  deleteStationsByUuid,
  deleteStationsFromDbByUuid,
  setSelectedStationRightNavItem,
  setSelectedStationUuid,
  setStateForNewStation,
  setStationEditMode,
  revertWalkbackPath,
  setStationCalculatedFields,
  setStationLoadingStatus,
} = stationSlice.actions;
