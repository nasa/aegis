import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: EvaState = {
  selectedEvaRightNavItem: "",
  selectedEvaUuid: "",
  selectedEvaSequenceItemUuid: "",
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
    upsertEva: (state, action: { payload: Eva }) => {
      upsertToArrayByUuid(state.evas, action.payload);
    },
    upsertEvas: (state, action: { payload: Eva[] }) => {
      action.payload.forEach((eva) => upsertToArrayByUuid(state.evas, eva));
    },
    upsertEvasFromDb: (state, action: { payload: Eva[] }) => {
      action.payload.forEach((eva) => upsertToArrayByUuid(state.evasFromDb, eva));
    },
    setEvas: (state, action: { payload: Eva[] }) => {
      state.evas = action.payload;
    },
    setEvasFromDb: (state, action: { payload: Eva[] }) => {
      state.evasFromDb = action.payload;
    },
    deleteEvaByUuid: (state, action: { payload: string }) => {
      state.evas = state.evas.filter((eva) => eva.uuid !== action.payload);
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
    setEvaSequence: (
      state,
      action: { payload: { evaUuid: string; sequence: EvaSequenceItem[] } }
    ) => {
      const eva = state.evas.find((eva) => eva.uuid === action.payload.evaUuid);
      if (eva) {
        eva.sequence = action.payload.sequence;
      }
    },
    setEvaEditMode: (state, action: { payload: { evaUuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        state.evasEditing.push(action.payload.evaUuid);
      } else {
        state.evasEditing = state.evasEditing.filter((uuid) => uuid !== action.payload.evaUuid);
      }
    },
    duplicateEva: (state, action: { payload: Eva }) => {
      state.evas.push(action.payload);
      // turn on edit mode for the new eva
      state.evasEditing.push(action.payload.uuid);
      // select the newly created eva
      state.selectedEvaUuid = action.payload.uuid;
      // expand the newly created eva
      state.expandedEvaUuids.push(action.payload.uuid);
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
  upsertEvas,
  upsertEvasFromDb,
  setEvas,
  setEvasFromDb,
  deleteEvaByUuid,
  deleteEvaFromDbByUuid,
  duplicateEva,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaRightNavItem,
  setExpandedEvaUuids,
  setEvaSequence,
  setEvaEditMode,
  setEvasCalculatedFields,
  clearEvaSelections,
} = evaSlice.actions;
