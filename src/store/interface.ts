import { createSlice } from "@reduxjs/toolkit";
import { actionTypes } from "utils/store";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "preset",
  bottomSectionSelectedLabel: "timeline",
  leftPanelIsOpen: true,
  rightPanelIsOpen: true,
  bottomPanelIsOpen: true,
  autoRightPanelOpen: true,
  autoBottomPanelOpen: true,
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
  stmViewExpandedItems: [],
  stmViewSelectedEvas: [],
  stmViewSelectedActionTypes: [...actionTypes],
  stmViewExpandTopTiers: true,
  stmViewShowCrosshairs: true,
  stmViewHoveredTopItem: null,
  stmViewHoveredLeftItem: null,
};

export const interfaceSlice = createSlice({
  name: "interface",
  initialState,
  reducers: {
    setSectionSelected: (state, action: { payload: InterfaceSection }) => {
      state.sectionSelectedLabel = action.payload;
    },
    setBottomSectionSelected: (state, action: { payload: BottomInterfaceSection }) => {
      state.bottomSectionSelectedLabel = action.payload;
    },
    setLeftPanelIsOpen: (state, action: { payload: boolean }) => {
      state.leftPanelIsOpen = action.payload;
    },
    setRightPanelIsOpen: (state, action: { payload: boolean }) => {
      state.rightPanelIsOpen = action.payload;
    },
    setBottomPanelIsOpen: (state, action: { payload: boolean }) => {
      state.bottomPanelIsOpen = action.payload;
    },
    setAutoRightPanelOpen: (state, action: { payload: boolean }) => {
      state.autoRightPanelOpen = action.payload;
    },
    setAutoBottomPanelOpen: (state, action: { payload: boolean }) => {
      state.autoBottomPanelOpen = action.payload;
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
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
    stmViewExpandItem: (state, action: { payload: STMViewExpandedItem }) => {
      state.stmViewExpandedItems.push(action.payload);
    },
    stmViewCollapseItem: (state, action: { payload: STMViewExpandedItem }) => {
      const newExpandedItems: STMViewExpandedItem[] = [];
      for (const expandedItem of state.stmViewExpandedItems) {
        if (expandedItem.uuid == action.payload.uuid && expandedItem.type === action.payload.type) {
          continue;
        } else {
          newExpandedItems.push(expandedItem);
        }
      }
      state.stmViewExpandedItems = newExpandedItems;
    },
    stmViewSetExpandedItems: (state, action: { payload: STMViewExpandedItem[] }) => {
      state.stmViewExpandedItems = action.payload;
    },
    stmViewToggleEva: (state, action: { payload: string }) => {
      const index = state.stmViewSelectedEvas.indexOf(action.payload);
      if (index > -1) {
        state.stmViewSelectedEvas.splice(index, 1);
      } else {
        state.stmViewSelectedEvas.push(action.payload);
      }
    },
    stmViewToggleSelectedActionType: (state, action: { payload: ActionType }) => {
      const index = state.stmViewSelectedActionTypes.indexOf(action.payload);
      if (index > -1) {
        state.stmViewSelectedActionTypes.splice(index, 1);
      } else {
        state.stmViewSelectedActionTypes.push(action.payload);
      }
    },
    stmViewToggleExpandTopTiers: (state) => {
      state.stmViewExpandTopTiers = !state.stmViewExpandTopTiers;
    },
    stmViewSetHoveredTopItem: (state, action: { payload: string }) => {
      state.stmViewHoveredTopItem = action.payload;
    },
    stmViewSetHoveredLeftItem: (state, action: { payload: string }) => {
      state.stmViewHoveredLeftItem = action.payload;
    },
    stmViewToggleCrosshairs: (state) => {
      state.stmViewShowCrosshairs = !state.stmViewShowCrosshairs;
    },
  },
});

export const {
  setSectionSelected,
  setBottomSectionSelected,
  setLeftPanelIsOpen,
  setRightPanelIsOpen,
  setBottomPanelIsOpen,
  setAutoRightPanelOpen,
  setAutoBottomPanelOpen,
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
  obliterateState,
  stmViewExpandItem,
  stmViewCollapseItem,
  stmViewSetExpandedItems,
  stmViewToggleEva,
  stmViewToggleSelectedActionType,
  stmViewToggleExpandTopTiers,
  stmViewToggleCrosshairs,
  stmViewSetHoveredTopItem,
  stmViewSetHoveredLeftItem,
} = interfaceSlice.actions;
