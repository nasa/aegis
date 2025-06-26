import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { setAllSliceStores } from "store/crossActions";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "store/storeUtils/store";

export const initialState: StationState = {
  stations: [],
  stationsFromDb: [],
  selectedStationUuid: null,
  selectedRightNavItem: "info_panel",
  stationsEditing: [],
  stationCirclesUIStates: {},
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
    selectStation: (state, action: { payload: { uuid: string } }) => {
      state.selectedStationUuid = action.payload.uuid; // select the newly created station
      state.selectedRightNavItem = "info_panel";
    },
    setStationEditMode: (
      state,
      action: { payload: { stationUuid: string; editMode: boolean } }
    ) => {
      if (action.payload.editMode) {
        if (!state.stationsEditing.includes(action.payload.stationUuid)) {
          state.stationsEditing.push(action.payload.stationUuid);
        }
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

    /**
     * Station Circle UI States
     */
    toggleStationCircleVisible: (
      state,
      action: { payload: { stationUuid: string; circleUuid: string } }
    ) => {
      const stationIndex = state.stations.findIndex(
        (station) => station.uuid === action.payload.stationUuid
      );
      if (stationIndex >= 0) {
        state.stations[stationIndex].mapCircleControls[action.payload.circleUuid].visible =
          !state.stations[stationIndex].mapCircleControls[action.payload.circleUuid].visible;
        state.stations[stationIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
    },
    setStationCircleStyle: (
      state,
      action: { payload: { stationUuid: string; circleDefUuid: string; style: MapSublayerStyle } }
    ) => {
      const stationIndex = state.stations.findIndex(
        (station) => station.uuid === action.payload.stationUuid
      );
      if (stationIndex >= 0) {
        state.stations[stationIndex].mapCircleControls[action.payload.circleDefUuid].style =
          action.payload.style;
        state.stations[stationIndex].updatedAt = roundDateToSecond(new Date()).toISOString();
      }
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
    deleteStationCirclesUIStates: (state, action: { payload: { stationUuid: string } }) => {
      delete state.stationCirclesUIStates[action.payload.stationUuid];
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
  selectStation,
  setStationEditMode,
  revertWalkbackPath,
  toggleStationCircleVisible,
  setStationCircleStyle,
  setStationCircleUIStates,
  setStationCircleUIState,
  deleteStationCirclesUIStates,
  resetAllStationCirclesUIStates,
  obliterateState,
} = stationSlice.actions;
