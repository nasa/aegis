import { createSlice } from "@reduxjs/toolkit";
import { cloneDeep } from "lodash";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: EvaState = {
  selectedEvaRightNavItem: null,
  selectedEvaUuid: null,
  selectedEvaSequenceItemUuid: null,
  expandedEvaUuids: [],
  evas: [],
  evasFromDb: [],
  evasEditing: [],
  calculatedFields: [],
};

export const evaSlice = createSlice({
  name: "eva",
  initialState,
  reducers: {
    upsertEva: {
      prepare: (eva: Eva, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: eva };
        } else {
          return {
            payload: { ...eva, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
      reducer: (state, action: { payload: Eva }) => {
        upsertToArrayByUuid(state.evas, action.payload);
      },
    },
    upsertEvas: {
      prepare: (evas: Eva[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: evas };
        } else {
          return {
            payload: evas.map((eva) => ({
              ...eva,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: Eva[] }) => {
        action.payload.forEach((eva) => upsertToArrayByUuid(state.evas, eva));
      },
    },
    upsertEvasFromDb: (state, action: { payload: Eva[] }) => {
      action.payload.forEach((eva) => upsertToArrayByUuid(state.evasFromDb, eva));
    },
    upsertEvaFromDb: (state, action: { payload: Eva }) => {
      upsertToArrayByUuid(state.evasFromDb, action.payload);
    },
    upsertEvaByField: {
      prepare: (
        evaUuid: string,
        fieldName: keyof Eva,
        value: Eva[keyof Eva],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { evaUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              evaUuid,
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
            evaUuid: string;
            fieldName: keyof Eva;
            value: Eva[keyof Eva];
            updatedAt: string;
          };
        }
      ) => {
        const eva = state.evas.find((s) => s.uuid === action.payload.evaUuid);
        const newEva: Eva = cloneDeep(eva);
        newEva.updatedAt = action.payload.updatedAt || eva.updatedAt;
        const key = action.payload.fieldName;
        (newEva as Record<typeof key, Eva[keyof Eva]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.evas, newEva);
      },
    },
    /* only called for populating store  */
    setEvas: (state, action: { payload: Eva[] }) => {
      state.evas = action.payload;
    },
    setEvasFromDb: (state, action: { payload: Eva[] }) => {
      state.evasFromDb = action.payload;
    },
    deleteEvaByUuid: (state, action: { payload: string }) => {
      state.evas = state.evas.filter((eva) => eva.uuid !== action.payload);
      state.selectedEvaUuid = null;
    },
    deleteEvaFromDbByUuid: (state, action: { payload: string }) => {
      state.evasFromDb = state.evasFromDb.filter((eva) => eva.uuid !== action.payload);
    },
    setSelectedEvaRightNavItem: (state, action: { payload: string }) => {
      state.selectedEvaRightNavItem = action.payload;
    },
    setSelectedEvaUuid: (state, action: { payload: string }) => {
      state.selectedEvaUuid = action.payload;
    },
    setSelectedEvaSequenceItemUuid: (state, action: { payload: string }) => {
      state.selectedEvaSequenceItemUuid = action.payload;
    },
    setExpandedEvaUuids: (state, action: { payload: string[] }) => {
      state.expandedEvaUuids = action.payload;
    },
    setEvaSequence: {
      reducer: (
        state,
        action: { payload: { evaUuid: string; sequence: EvaSequenceItem[]; updatedAt: string } }
      ) => {
        const eva = state.evas.find((eva) => eva.uuid === action.payload.evaUuid);
        if (eva) {
          eva.sequence = action.payload.sequence;
          eva.updatedAt = action.payload.updatedAt;
        }
      },
      prepare: (payload: { evaUuid: string; sequence: EvaSequenceItem[] }) => {
        return {
          payload: {
            evaUuid: payload.evaUuid,
            sequence: payload.sequence,
            updatedAt: roundDateToSecond(new Date()).toISOString(),
          },
        };
      },
    },
    setEvaEditMode: (state, action: { payload: { evaUuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        state.evasEditing.push(action.payload.evaUuid);
      } else {
        state.evasEditing = state.evasEditing.filter((uuid) => uuid !== action.payload.evaUuid);
      }
    },
    setStateForNewEva: (state, action: { payload: { uuid: string } }) => {
      state.evasEditing.push(action.payload.uuid); // turn on edit mode for the new eva
      state.selectedEvaUuid = action.payload.uuid; // select the newly created eva
      state.expandedEvaUuids.push(action.payload.uuid); // expand the newly created eva
      state.selectedEvaRightNavItem = "info_panel"; // set the selected tab to the EVA's info tab
    },
    setEvasCalculatedFields: (
      state,
      action: { payload: { calculatedFields: EvaCalculatedFields[] } }
    ) => {
      state.calculatedFields = action.payload.calculatedFields;
    },
    clearEvaSelections: (state) => {
      state.selectedEvaRightNavItem = "";
      state.selectedEvaUuid = "";
      state.selectedEvaSequenceItemUuid = "";
    },
  },
});

export const {
  upsertEva,
  upsertEvaFromDb,
  upsertEvas,
  upsertEvasFromDb,
  upsertEvaByField,
  setEvas,
  setEvasFromDb,
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  setStateForNewEva,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaRightNavItem,
  setExpandedEvaUuids,
  setEvaSequence,
  setEvaEditMode,
  setEvasCalculatedFields,
  clearEvaSelections,
} = evaSlice.actions;
