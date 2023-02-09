import { createSlice } from "@reduxjs/toolkit";

export const initialState: EvaState = {
  selectedEvaRightNavItem: "",
  selectedEvaUuid: "",
  selectedEvaSequenceItemUuid: "",
  expandedEvaUuids: [],
  evas: [],
  evasFromDb: [],
  evasEditing: [],
  traverses: [],
  traversesFromDb: [],
  traversesEditing: [],
};

export const evaSlice = createSlice({
  name: "eva",
  initialState,
  reducers: {},
});

export const {} = evaSlice.actions;
