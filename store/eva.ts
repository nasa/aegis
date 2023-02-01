import { createSlice } from "@reduxjs/toolkit";

export const initialState: EvaState = {
  eva: {
    name: "EVA 1",
    evaItems: [
      {
        type: "lander",
        name: "Egress",
        uuid: "ca2ad4e2-5bbb-494b-b6a7-641eb91152ad",
        location: null,
      },
      {
        type: "traverse",
        name: "T-Snake",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b2",
        location: null,
      },
      {
        type: "station",
        name: "S-Unicorn",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b3",
        location: null,
      },
      {
        type: "traverse",
        name: "T-Frog",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b4",
        location: null,
      },
      {
        type: "station",
        name: "S-Bear",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b5",
        location: null,
      },
      {
        type: "traverse",
        name: "T-Possum",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b6",
        location: null,
      },
      {
        type: "lander",
        name: "Ingress",
        uuid: "ca2ad4e2-5bbb-494b-b6a7-641eb91152a7",
        location: null,
      },
    ],
  },
};

export const evaSlice = createSlice({
  name: "eva",
  initialState,
  reducers: {
    appendEvaItem: (state, action: { payload: EvaItem }) => {
      state.eva.evaItems = [...state.eva.evaItems, action.payload];
    },
    updateEvaItemLocation: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint | AEGISPoint[] } }
    ) => {
      state.eva.evaItems = state.eva.evaItems.map((evaItem) => {
        if (evaItem.uuid === action.payload.uuid) {
          return { ...evaItem, location: action.payload.location };
        }
        return evaItem;
      });
    },
  },
});

export const { appendEvaItem, updateEvaItemLocation } = evaSlice.actions;
