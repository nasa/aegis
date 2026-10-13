import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "./crossActions";

export const initialState: InterfaceState = {
  sectionSelectedLabel: "preset",
  bottomSectionSelectedLabel: "timeline",
  leftPanelIsOpen: true,
  rightPanelIsOpen: true,
  bottomPanelIsOpen: true,
  mapMenuIsOpen: false,
  autoRightPanelOpen: true,
  autoBottomPanelOpen: true,
  elevationPendingItemUuids: [],
  timelineShowDistanceFromLander: true,
  timelineShowElevation: true,
  slopeColorMode: "standard",
  foldersInterface: {},
};

/** Folder UI state for a folder, with defaults for folders that have no saved state yet. */
export const getFolderInterface = (
  foldersInterface: FoldersInterfaceState,
  folderUuid: string
): FolderInterface =>
  foldersInterface[folderUuid] ?? {
    uuid: folderUuid,
    isOpen: true,
    visible: true,
    editing: false,
    editingNameValue: null,
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
    setMapMenuIsOpen: (state, action: { payload: boolean }) => {
      state.mapMenuIsOpen = action.payload;
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
    setSlopeColorMode: (state, action: { payload: SlopeColorMode }) => {
      state.slopeColorMode = action.payload;
    },
    folderToggleOpenClose: (state, action: { payload: { uuid: string } }) => {
      const folder = getFolderInterface(state.foldersInterface, action.payload.uuid);
      state.foldersInterface[action.payload.uuid] = { ...folder, isOpen: !folder.isOpen };
    },
    folderToggleVisible: (state, action: { payload: { uuid: string } }) => {
      const folder = getFolderInterface(state.foldersInterface, action.payload.uuid);
      state.foldersInterface[action.payload.uuid] = { ...folder, visible: !folder.visible };
    },
    setFolderInterfaceEditing: (
      state,
      action: { payload: { folderUuid: string; editing: boolean; folderName?: string } }
    ) => {
      const folder = getFolderInterface(state.foldersInterface, action.payload.folderUuid);
      state.foldersInterface[action.payload.folderUuid] = {
        ...folder,
        editing: action.payload.editing,
        // Entering edit mode starts from the current folder name; leaving it clears the value
        editingNameValue: action.payload.editing ? (action.payload.folderName ?? null) : null,
      };
    },
    setFolderInterfaceNameValue: (
      state,
      action: { payload: { folderUuid: string; editingNameValue: string } }
    ) => {
      const folder = getFolderInterface(state.foldersInterface, action.payload.folderUuid);
      state.foldersInterface[action.payload.folderUuid] = {
        ...folder,
        editingNameValue: action.payload.editingNameValue,
      };
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
  setMapMenuIsOpen,
  setAutoRightPanelOpen,
  setAutoBottomPanelOpen,
  insertElevationPending,
  removeElevationPending,
  setShowDistanceFromLander,
  setShowElevation,
  setSlopeColorMode,
  folderToggleOpenClose,
  folderToggleVisible,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
  obliterateState,
} = interfaceSlice.actions;
