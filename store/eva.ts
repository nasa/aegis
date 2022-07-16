import { createSlice } from "@reduxjs/toolkit";
import { LatLng } from "leaflet";

export const initialState: EvaState = {
  eva: {
    name: "EVA 1",
    evaItems: [
      {
        type: "station",
        name: "Lander",
        uuid: "ca2ad4e2-5bbb-494b-b6a7-641eb91152ad",
        latLngJSON: null,
        editActive: false,
      },
      {
        type: "traverse",
        name: "Traverse 1",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b2",
        latLngsJSON: null,
        editActive: false,
      },
      {
        type: "station",
        name: "Station 1",
        uuid: "e58f1fae-ea2c-48e4-b205-942c641fa1b3",
        latLngJSON: null,
        editActive: false,
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
    updateStationLatLngJSON: (state, action: { payload: { uuid: string; latLngJSON: string } }) => {
      state.eva.evaItems = state.eva.evaItems.map((evaItem) => {
        if (evaItem.uuid === action.payload.uuid) {
          return { ...evaItem, latLngJSON: action.payload.latLngJSON, editActive: false };
        }
        return evaItem;
      });
    },
    updateTraverseLatLngsJSON: (
      state,
      action: { payload: { uuid: string; latLngsJSON: string } }
    ) => {
      state.eva.evaItems = state.eva.evaItems.map((evaItem) => {
        if (evaItem.uuid === action.payload.uuid) {
          return { ...evaItem, latLngsJSON: action.payload.latLngsJSON, editActive: false };
        }
        return evaItem;
      });
    },
    toggleEvaItemEditActive: (state, action: { payload: string }) => {
      state.eva.evaItems = state.eva.evaItems.map((evaItem) => {
        if (evaItem.uuid === action.payload) {
          return { ...evaItem, editActive: !evaItem.editActive };
        }
        return evaItem;
      });
    },
  },
});

export const {
  appendEvaItem,
  updateStationLatLngJSON,
  updateTraverseLatLngsJSON,
  toggleEvaItemEditActive,
} = evaSlice.actions;
