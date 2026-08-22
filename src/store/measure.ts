import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { upsertToArrayByUuid } from "store/storeUtils/store";

export const initialState: MeasureState = {
  selectedMeasurementUuid: null,
  measurements: [],
  elevationStatusByUuid: {},
};

export const measureSlice = createSlice({
  name: "measure",
  initialState,
  reducers: {
    setSelectedMeasurementUuid: (state, action: { payload: string }) => {
      state.selectedMeasurementUuid = action.payload;
    },
    upsertMeasurement: (state, action: { payload: Measurement }) => {
      upsertToArrayByUuid(state.measurements, action.payload);
    },
    removeMeasurement: (state, action: { payload: string }) => {
      state.measurements = state.measurements.filter(
        (measurement) => measurement.uuid !== action.payload
      );
      delete state.elevationStatusByUuid[action.payload];
    },
    updateMeasurementGeometry: (
      state,
      action: {
        payload: {
          measurementUuid: string;
          path: AEGISPoint[];
          pathSegmentDistances: number[];
          pathSegmentBearings: number[];
        };
      }
    ) => {
      const measurement = state.measurements.find(
        (item) => item.uuid === action.payload.measurementUuid
      );
      if (!measurement) return;
      measurement.path = action.payload.path;
      measurement.pathSegmentDistances = action.payload.pathSegmentDistances;
      measurement.pathSegmentBearings = action.payload.pathSegmentBearings;
    },
    setMeasurementElevationStatus: (
      state,
      action: {
        payload: {
          measurementUuid: string;
          generation: number;
          status: MeasurementElevationStatus;
          retryAfterMs?: number;
        };
      }
    ) => {
      const previous = state.elevationStatusByUuid[action.payload.measurementUuid];
      state.elevationStatusByUuid[action.payload.measurementUuid] = {
        generation: Math.max(previous?.generation ?? 0, action.payload.generation),
        displayedGeneration: previous?.displayedGeneration ?? 0,
        status: action.payload.status,
        retryAfterMs: action.payload.retryAfterMs,
      };
    },
    applyMeasurementElevation: (
      state,
      action: {
        payload: {
          measurementUuid: string;
          generation: number;
          elevations: number[][];
          pathSegmentDistances: number[];
          hasNewerPending: boolean;
        };
      }
    ) => {
      const measurement = state.measurements.find(
        (item) => item.uuid === action.payload.measurementUuid
      );
      const status = state.elevationStatusByUuid[action.payload.measurementUuid];
      if (!measurement || action.payload.generation <= (status?.displayedGeneration ?? 0)) return;
      measurement.pathSegmentElevations = action.payload.elevations;
      measurement.elevationPathSegmentDistances = action.payload.pathSegmentDistances;
      state.elevationStatusByUuid[action.payload.measurementUuid] = {
        generation: Math.max(status?.generation ?? 0, action.payload.generation),
        displayedGeneration: action.payload.generation,
        status: action.payload.hasNewerPending ? "stale" : "idle",
      };
    },
    upsertMeasurementByField: {
      prepare: (
        measurementUuid: string,
        fieldName: keyof Measurement,
        value: Measurement[keyof Measurement]
      ) => {
        return {
          payload: {
            measurementUuid,
            fieldName,
            value,
          },
        };
      },
      reducer: (
        state,
        action: {
          payload: {
            measurementUuid: string;
            fieldName: keyof Measurement;
            value: Measurement[keyof Measurement];
          };
        }
      ) => {
        const measurement = state.measurements.find(
          (t) => t.uuid === action.payload.measurementUuid
        );
        const newMeasurement: Measurement = cloneDeep(measurement);

        const key = action.payload.fieldName;
        (newMeasurement as Record<typeof key, Measurement[keyof Measurement]>)[key] =
          action.payload.value;
        upsertToArrayByUuid(state.measurements, newMeasurement);
      },
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const {
  setSelectedMeasurementUuid,
  upsertMeasurement,
  removeMeasurement,
  updateMeasurementGeometry,
  setMeasurementElevationStatus,
  applyMeasurementElevation,
  upsertMeasurementByField,
  obliterateState,
} = measureSlice.actions;
