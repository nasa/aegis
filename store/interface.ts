import { createSlice } from "@reduxjs/toolkit";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "preset",
  rightPanelOpen: true,
  elevationPendingItemUuids: [],
  timelineShowDistanceFromLander: true,
  timelineShowElevation: true,
  actionsCollapsed: [],
};

export const interfaceSlice = createSlice({
  name: "interface",
  initialState,
  reducers: {
    setSectionSelected: (state, action: { payload: InterfaceSection }) => {
      state.sectionSelectedLabel = action.payload;
    },
    setRightPanelOpen: (state, action: { payload: boolean }) => {
      state.rightPanelOpen = action.payload;
    },
    insertElevationPending: (state, action: { payload: string }) => {
      state.elevationPendingItemUuids.push(action.payload);
    },
    removeElevationPending: (state, action: { payload: string }) => {
      const index = state.elevationPendingItemUuids.indexOf(action.payload);
      if (index > -1) state.elevationPendingItemUuids.splice(index, 1);
    },
    setShowDistanceFromLander: (state, action: { payload: boolean }) => {
      state.timelineShowDistanceFromLander = action.payload;
    },
    setShowElevation: (state, action: { payload: boolean }) => {
      state.timelineShowElevation = action.payload;
    },
    collapseActions: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        if (!state.actionsCollapsed.includes(uuid)) {
          state.actionsCollapsed.push(uuid);
        }
      });
    },
    expandActions: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        state.actionsCollapsed = state.actionsCollapsed.filter(
          (existingUuid) => existingUuid !== uuid
        );
      });
    },
  },
});

export const {
  setSectionSelected,
  setRightPanelOpen,
  insertElevationPending,
  removeElevationPending,
  setShowDistanceFromLander,
  setShowElevation,
  collapseActions,
  expandActions,
} = interfaceSlice.actions;
