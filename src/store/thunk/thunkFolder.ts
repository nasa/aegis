import appCreateAsyncThunk from "./thunkUtil";
import { generateBlankFolder } from "store/storeUtils/folder";
import {
  setFolders,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
  folderToggleOpenClose,
  folderToggleVisible,
} from "store/interface";
import * as httpClient_folder from "http-client/folder";
import Cookies from "js-cookie";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { getAutomergeDocHandles } from "client/automergeDocHandles";
import { ConsoleLogger as clientLogger } from "utils/logging/clientLogger";

export const thunkCreateFolder = appCreateAsyncThunk<{ type: FolderType }>(
  "thunkCreateFolder",
  async ({ type }, { dispatch, getState }) => {
    const missionDocHandle = getAutomergeDocHandles().mission;
    const mission = missionDocHandle.doc();

    const blankFolder = generateBlankFolder({
      missionId: mission.id,
      type,
      name: makeUniqueStringCopy(
        "New Folder",
        getState()
          .interface.folders.filter((f) => f.type === type)
          .map((f) => f.name),
        false
      ),
    });

    // Save the folder first - this will automatically create the folder interface
    dispatch(thunkSaveFolder({ folder: blankFolder }));

    // Set the folder in edit mode using the direct action
    dispatch(
      setFolderInterfaceEditing({
        folderUuid: blankFolder.uuid,
        editing: true,
      })
    );

    dispatch(
      setFolderInterfaceNameValue({
        folderUuid: blankFolder.uuid,
        editingNameValue: blankFolder.name,
      })
    );
  }
);

export const thunkSaveFolder = appCreateAsyncThunk<{ folder: Folder }>(
  "thunkSaveFolder",
  async ({ folder }, { dispatch, getState }) => {
    if (!folder) return;
    const { folders } = getState().interface;
    const existingFolder = folders.find((f) => f.uuid === folder.uuid);
    if (existingFolder) {
      dispatch(setFolders(folders.map((f) => (f.uuid === folder.uuid ? folder : f))));
    } else {
      dispatch(setFolders([...folders, folder]));
    }
    // save folder to db
    const response = await httpClient_folder.upsertFolders([folder]);
    if (response.status !== "success") {
      throw new Error("Failed to upsert folder");
    }
  }
);

export const thunkAddRemoveFolderItem = appCreateAsyncThunk<{
  folderUuid: string;
  itemUuid: string;
}>("thunkAddRemoveFolderItem", async ({ folderUuid, itemUuid }, { dispatch, getState }) => {
  const { folders } = getState().interface;
  // find all folders that contain the item
  const foldersContainingItem = folders.filter((f) => f.items.includes(itemUuid));
  // remove the item from all folders. This accounts for dragging from folder to folder
  foldersContainingItem.forEach((folder) => {
    const newItems = folder.items.filter((item) => item !== itemUuid);
    const updatedFolder = {
      ...folder,
      items: newItems,
    };
    dispatch(thunkSaveFolder({ folder: updatedFolder }));
  });

  // if folderUuid is null, we're done
  if (folderUuid === null) return;

  // add the item to the new folder
  const folder: Folder | undefined = folders.find((f) => f.uuid === folderUuid);
  let newItems: string[] = [];
  {
    newItems = [...folder.items, itemUuid];
  }
  const updatedFolder = {
    ...folder,
    items: newItems,
  };

  dispatch(thunkSaveFolder({ folder: updatedFolder }));
});

export const thunkDeleteFolder = appCreateAsyncThunk<{ folderUuid: string }>(
  "thunkDeleteFolder",
  async ({ folderUuid }, { dispatch, getState }) => {
    if (!folderUuid) return;
    const folders = getState().interface.folders;

    const folder = folders.find((f) => f.uuid === folderUuid);
    if (!folder) return;

    if (folder.items.length > 0) {
      alert("Cannot delete folder with items in it");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this folder?")) return;

    // Remove folder state from cookie
    try {
      const cookieKey = "AEGIS_Folders_Interface";
      const existingStates = Cookies.get(cookieKey);
      if (existingStates) {
        const parsedStates = JSON.parse(existingStates);
        delete parsedStates[folderUuid];
        Cookies.set(cookieKey, JSON.stringify(parsedStates), { path: "/" });
      }
    } catch (error) {
      clientLogger.error(
        { logId: "thunk-folder", logValue: "Error removing folder state from cookie" },
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // delete folder from db
    const response = await httpClient_folder.deleteFolders([folderUuid]);
    if (response.status !== "success") {
      throw new Error("Failed to delete folder");
    }

    dispatch(setFolders(folders.filter((f) => f.uuid !== folderUuid)));
  }
);

export const thunkToggleFolderOpen = appCreateAsyncThunk<{ folderUuid: string }>(
  "thunkToggleFolderOpen",
  async ({ folderUuid }, { dispatch, getState }) => {
    // Get the current state of the folder to determine what the new state will be
    const folderInterface = getState().interface.foldersInterface.find(
      (f) => f.uuid === folderUuid
    );
    const newIsOpen = !folderInterface?.isOpen;

    // Update cookie first
    try {
      const cookieKey = "AEGIS_Folders_Interface";
      const existingStates = Cookies.get(cookieKey);
      const parsedStates = existingStates ? JSON.parse(existingStates) : {};
      Cookies.set(
        cookieKey,
        JSON.stringify({
          ...parsedStates,
          [folderUuid]: {
            ...parsedStates[folderUuid],
            isOpen: newIsOpen,
          },
        }),
        { path: "/" }
      );
    } catch (error) {
      clientLogger.error(
        { logId: "thunk-folder", logValue: "Error saving folder state to cookie" },
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // Now dispatch the action to update the Redux store
    dispatch(folderToggleOpenClose({ uuid: folderUuid }));
  }
);

export const thunkToggleFolderVisible = appCreateAsyncThunk<{ folderUuid: string }>(
  "thunkToggleFolderVisible",
  async ({ folderUuid }, { dispatch, getState }) => {
    // Get the current state of the folder to determine what the new state will be
    const folderInterface = getState().interface.foldersInterface.find(
      (f) => f.uuid === folderUuid
    );
    const newIsVisible = !folderInterface?.visible;

    // Update cookie
    try {
      const cookieKey = "AEGIS_Folders_Interface";
      const existingStates = Cookies.get(cookieKey);
      const parsedStates = existingStates ? JSON.parse(existingStates) : {};
      Cookies.set(
        cookieKey,
        JSON.stringify({
          ...parsedStates,
          [folderUuid]: {
            ...parsedStates[folderUuid],
            visible: newIsVisible,
          },
        }),
        { path: "/" }
      );
    } catch (error) {
      clientLogger.error(
        { logId: "thunk-folder", logValue: "Error saving folder state to cookie" },
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // Now dispatch the action to update the Redux store
    dispatch(folderToggleVisible({ uuid: folderUuid }));
  }
);
