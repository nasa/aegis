import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { upsertToArrayByUuid } from "store/storeUtils/store";

export const initialState: MeasureState = {
  selectedMeasurementUuid: null,
  measurements: [],
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
    },
    upsertMeasurementField: {
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
  upsertMeasurementField,
  obliterateState,
} = measureSlice.actions;
