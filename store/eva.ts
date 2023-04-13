import { createSlice } from "@reduxjs/toolkit";
import { upsertToArrayByUuid } from "utils/store";
import { v4 as uuidv4 } from "uuid";

export const initialState: EvaState = {
  selectedEvaRightNavItem: "",
  selectedLeftNavItem: "",
  selectedEvaUuid: "",
  selectedEvaSequenceItemUuid: "",
  expandedEvaUuids: [],
  evas: [],
  evasFromDb: [],
  evasEditing: [],
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
    deleteEva: (state, action: { payload: Eva }) => {
      state.evas = state.evas.filter((eva) => eva.uuid !== action.payload.uuid);
    },
    deleteAllEvas: (state) => {
      state.evas = [];
    },
    deleteAllEvasFromDb: (state) => {
      state.evasFromDb = [];
    },
    duplicateEva: (state, action: { payload: Eva }) => {
      const eva = action.payload;
      const newEva = { ...eva, uuid: uuidv4(), name: eva.name + " (copy)" };
      state.evas.push(newEva);
      // turn on edit mode for the new eva
      state.evasEditing.push(newEva.uuid);
      // select the newly created eva
      state.selectedEvaUuid = newEva.uuid;
      // expand the newly created eva
      state.expandedEvaUuids.push(newEva.uuid);
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
  },
});

export const {
  upsertEva,
  upsertEvas,
  upsertEvasFromDb,
  setEvas,
  setEvasFromDb,
  deleteEva,
  deleteAllEvas,
  deleteAllEvasFromDb,
  duplicateEva,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaRightNavItem,
  setExpandedEvaUuids,
  setEvaSequence,
  setEvaEditMode,
} = evaSlice.actions;
