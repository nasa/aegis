import { createSlice } from "@reduxjs/toolkit";
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
  elevationPendingRequests: {},
  timelineShowDistanceFromLander: true,
  timelineShowElevation: true,
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
    insertElevationPending: (state, action: { payload: { uuid: string; requestId: string } }) => {
      state.elevationPendingRequests[action.payload.requestId] = action.payload.uuid;
      if (!state.elevationPendingItemUuids.includes(action.payload.uuid)) {
        state.elevationPendingItemUuids.push(action.payload.uuid);
      }
    },
    removeElevationPending: (state, action: { payload: { uuid: string; requestId: string } }) => {
      delete state.elevationPendingRequests[action.payload.requestId];
      if (!Object.values(state.elevationPendingRequests).includes(action.payload.uuid)) {
        state.elevationPendingItemUuids = state.elevationPendingItemUuids.filter(
          (uuid) => uuid !== action.payload.uuid
        );
      }
    },
    setShowDistanceFromLander: (state, action: { payload: boolean }) => {
      state.timelineShowDistanceFromLander = action.payload;
    },
    setShowElevation: (state, action: { payload: boolean }) => {
      state.timelineShowElevation = action.payload;
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
  setFolders,
  folderToggleOpenClose,
  folderToggleVisible,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
  obliterateState,
} = interfaceSlice.actions;
