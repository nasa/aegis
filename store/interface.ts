import { createSlice } from "@reduxjs/toolkit";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "preset",
  leftPanelOpen: true,
  rightPanelOpen: true,
  bottomPanelOpen: true,
  elevationPendingItemUuids: [],
  timelineShowDistanceFromLander: true,
  timelineShowElevation: true,
  actionsExpanded: [],
  socketStatus: {
    visitorCounts: {
      editors: 0,
      viewers: 0,
    },
    connectionStatus: "disconnected",
    lastEditEvent: null,
    AEGISVersion: null,
  },
};

export const interfaceSlice = createSlice({
  name: "interface",
  initialState,
  reducers: {
    setSectionSelected: (state, action: { payload: InterfaceSection }) => {
      state.sectionSelectedLabel = action.payload;
    },
    setLeftPanelOpen: (state, action: { payload: boolean }) => {
      state.leftPanelOpen = action.payload;
    },
    setRightPanelOpen: (state, action: { payload: boolean }) => {
      state.rightPanelOpen = action.payload;
    },
    setBottomPanelOpen: (state, action: { payload: boolean }) => {
      state.bottomPanelOpen = action.payload;
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
        state.actionsExpanded = state.actionsExpanded.filter(
          (existingUuid) => existingUuid !== uuid
        );
      });
    },
    expandActions: (state, action: { payload: string[] }) => {
      action.payload.forEach((uuid) => {
        if (!state.actionsExpanded.includes(uuid)) {
          state.actionsExpanded.push(uuid);
        }
      });
    },
    setVisitorCounts: (state, action: { payload: VisitorCounts }) => {
      state.socketStatus.visitorCounts = action.payload;
    },
    setSocketConnectionStatus: (state, action: { payload: ConnectionStatus }) => {
      state.socketStatus.connectionStatus = action.payload;
    },
    setLastEditEvent: (state, action: { payload: EditEvent }) => {
      state.socketStatus.lastEditEvent = action.payload;
    },

    setAEGISVersion: (state, action: { payload: string }) => {
      state.socketStatus.AEGISVersion = action.payload;
    },
  },
});

export const {
  setSectionSelected,
  setLeftPanelOpen,
  setRightPanelOpen,
  setBottomPanelOpen,
  insertElevationPending,
  removeElevationPending,
  setShowDistanceFromLander,
  setShowElevation,
  collapseActions,
  expandActions,
  setVisitorCounts,
  setSocketConnectionStatus,
  setLastEditEvent,
  setAEGISVersion,
} = interfaceSlice.actions;
