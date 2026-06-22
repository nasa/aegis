import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: EvaState = {
  selectedEvaRightNavItem: "info_panel",
  selectedEvaUuid: null,
  selectedEvaSequenceItemUuid: null,
  expandedEvaUuids: [],
  evaDropdownUIStates: {},
  showRunningRexOnly: false,
  runningRexExpanded: true,
};

export const evaSlice = createSlice({
  name: "eva",
  initialState,
  reducers: {
    setSelectedEvaRightNavItem: (state, action: { payload: string }) => {
      state.selectedEvaRightNavItem = action.payload;
    },
    setSelectedEvaUuid: (state, action: { payload: string }) => {
      state.selectedEvaUuid = action.payload;
    },
    setSelectedEvaSequenceItemUuid: (state, action: { payload: string }) => {
      state.selectedEvaSequenceItemUuid = action.payload;
    },
    setOnlyShowRunningRex: (state, action: { payload: boolean }) => {
      state.showRunningRexOnly = action.payload;
    },
    setRunningRexExpanded: (state, action: { payload: boolean }) => {
      state.runningRexExpanded = action.payload;
    },
    upsertExpandedEvaUuids: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        if (!state.expandedEvaUuids.includes(uuid)) {
          state.expandedEvaUuids.push(uuid);
        }
      });
    },
    deleteExpandedEvaUuids: (state, action: { payload: string[] }) => {
      state.expandedEvaUuids = state.expandedEvaUuids.filter(
        (uuid) => !action.payload.includes(uuid)
      );
    },
    setEvaDropdownUIState: (
      state,
      action: {
        payload: {
          asPlannedEvaUuid: string;
          dropdownEvaUuid: string;
        };
      }
    ) => {
      state.evaDropdownUIStates[action.payload.asPlannedEvaUuid] = action.payload.dropdownEvaUuid;
    },
    selectEva: (state, action: { payload: { uuid: string } }) => {
      state.selectedEvaUuid = action.payload.uuid;
      state.expandedEvaUuids.push(action.payload.uuid);
      state.selectedEvaRightNavItem = "info_panel";
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.eva);
    });
  },
});

export const {
  selectEva,
  setSelectedEvaUuid,
  setSelectedEvaSequenceItemUuid,
  setSelectedEvaRightNavItem,
  setOnlyShowRunningRex,
  setRunningRexExpanded,
  setEvaDropdownUIState,
  upsertExpandedEvaUuids,
  deleteExpandedEvaUuids,
  obliterateState,
} = evaSlice.actions;
