import { createSlice } from "@reduxjs/toolkit";
import { actionTypes } from "store/storeUtils/action";
import { setAllSliceStores } from "./crossActions";

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
  stmViewExpandedItems: [],
  stmViewSelectedEvas: [],
  stmViewSelectedActionTypes: [...actionTypes],
  stmViewExpandTopTiers: true,
  stmViewShowCrosshairs: true,
  stmViewHoveredTopItem: null,
  stmViewHoveredLeftItem: null,
  stmRulesSelectedRexes: [],
  appVersion: null,
  socketStatus: {
    connectionStatus: "disconnected",
    lastEditEvent: null,
    lastStatusFromServer: {
      visitorCounts: {
        editors: 0,
        viewers: 0,
      },
      timestamp: 0,
      serverVersion: null,
    },
  },
  folders: [],
  foldersInterface: [],
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
    stmRulesToggleRex: (state, action: { payload: string }) => {
      const index = state.stmRulesSelectedRexes.indexOf(action.payload);
      if (index > -1) {
        state.stmRulesSelectedRexes.splice(index, 1);
      } else {
        state.stmRulesSelectedRexes.push(action.payload);
      }
    },
    setFolders: (state, action: { payload: Folder[] }) => {
      state.folders = action.payload;

      // Automatically handle folder interfaces when folders are set
      const existingInterfaces = state.foldersInterface || [];
      const newFolderInterfaces: FolderInterface[] = [];

      // Check for new folders that need interfaces
      for (const folder of action.payload) {
        const existingInterface = existingInterfaces.find((f) => f.uuid === folder.uuid);
        if (!existingInterface) {
          newFolderInterfaces.push({
            uuid: folder.uuid,
            isOpen: true,
            visible: true,
            editing: false,
            editingNameValue: null,
          });
        }
      }

      // Update interfaces array with new interfaces if any were created
      if (newFolderInterfaces.length > 0) {
        state.foldersInterface = [...existingInterfaces, ...newFolderInterfaces];
      }

      // Remove interfaces for folders that no longer exist
      const folderUuids = action.payload.map((f) => f.uuid);
      state.foldersInterface = state.foldersInterface.filter((fi) => folderUuids.includes(fi.uuid));
    },

    folderToggleOpenClose: (state, action: { payload: { uuid: string } }) => {
      const folder = state.foldersInterface.find((folder) => folder.uuid === action.payload.uuid);
      if (folder) {
        folder.isOpen = !folder.isOpen;
      }
    },
    folderToggleVisible: (state, action: { payload: { uuid: string } }) => {
      const folder = state.foldersInterface.find((folder) => folder.uuid === action.payload.uuid);
      if (folder) {
        folder.visible = !folder.visible;
      }
    },
    setFolderInterfaceEditing: (
      state,
      action: { payload: { folderUuid: string; editing: boolean } }
    ) => {
      const folder = state.foldersInterface.find((f) => f.uuid === action.payload.folderUuid);
      if (folder) {
        folder.editing = action.payload.editing;
        if (action.payload.editing) {
          // When setting to editing mode, set the editingNameValue to the current folder name
          const actualFolder = state.folders.find((f) => f.uuid === action.payload.folderUuid);
          if (actualFolder) {
            folder.editingNameValue = actualFolder.name;
          }
        } else {
          // When exiting editing mode, clear the editingNameValue
          folder.editingNameValue = null;
        }
      }
    },
    setFolderInterfaceNameValue: (
      state,
      action: { payload: { folderUuid: string; editingNameValue: string } }
    ) => {
      const folder = state.foldersInterface.find((f) => f.uuid === action.payload.folderUuid);
      if (folder) {
        folder.editingNameValue = action.payload.editingNameValue;
      }
    },
    setLastStatusFromServer: (state, action: { payload: StatusFromServer }) => {
      state.socketStatus.lastStatusFromServer = action.payload;
      // due to a store race condition, sometimes the connectionStatus is not "connected". Update it
      if (state.socketStatus.connectionStatus !== "connected") {
        state.socketStatus.connectionStatus = "connected";
      }
    },
    setSocketConnectionStatus: (state, action: { payload: ConnectionStatus }) => {
      state.socketStatus.connectionStatus = action.payload;
    },
    setLastEditEvent: (state, action: { payload: EditEvent }) => {
      state.socketStatus.lastEditEvent = action.payload;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.interface);
    });
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
  stmViewExpandItem,
  stmViewCollapseItem,
  stmViewSetExpandedItems,
  stmViewToggleEva,
  stmViewToggleSelectedActionType,
  stmViewToggleExpandTopTiers,
  stmViewToggleCrosshairs,
  stmViewSetHoveredTopItem,
  stmViewSetHoveredLeftItem,
  stmRulesToggleRex,
  setFolders,
  folderToggleOpenClose,
  folderToggleVisible,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
  setLastStatusFromServer,
  setSocketConnectionStatus,
  setLastEditEvent,
  obliterateState,
} = interfaceSlice.actions;
