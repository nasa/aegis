import appCreateAsyncThunk from "./thunkUtil";
import { generateBlankFolder } from "store/storeUtils/folder";
import {
  getFolderInterface,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
  folderToggleOpenClose,
} from "store/interface";
import Cookies from "js-cookie";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { getMissionDocHandle, withMissionChange } from "client/automergeDocHandles";
import { clientLogger } from "utils/logging/clientLogger";
import {
  applyRenameFolder,
  applyUpsertFolder,
  applyToggleFolderVisible,
} from "operations/apply/apply-mission-folder";

export const thunkCreateFolder = appCreateAsyncThunk<{ type: FolderType }>(
  "thunkCreateFolder",
  async ({ type }, { dispatch }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();

    const blankFolder = generateBlankFolder({
      type,
      name: makeUniqueStringCopy(
        "New Folder",
        Object.values(mission.folders ?? {})
          .filter((f) => f.type === type)
          .map((f) => f.name),
        false
      ),
    });

    withMissionChange((m) => applyUpsertFolder(m, blankFolder));

    // Put the new folder's name in edit mode
    dispatch(
      setFolderInterfaceEditing({
        folderUuid: blankFolder.uuid,
        editing: true,
        folderName: blankFolder.name,
      })
    );
  }
);

export const thunkRenameFolder = appCreateAsyncThunk<{ folderUuid: string; name: string }>(
  "thunkRenameFolder",
  async ({ folderUuid, name }, { dispatch }) => {
    withMissionChange((m) => applyRenameFolder(m, { folderUuid, name }));
    dispatch(setFolderInterfaceEditing({ folderUuid, editing: false }));
    dispatch(setFolderInterfaceNameValue({ folderUuid, editingNameValue: null }));
  }
);

export const thunkToggleFolderOpen = appCreateAsyncThunk<{ folderUuid: string }>(
  "thunkToggleFolderOpen",
  async ({ folderUuid }, { dispatch, getState }) => {
    // Get the current state of the folder to determine what the new state will be
    const folderInterface = getFolderInterface(getState().interface.foldersInterface, folderUuid);
    const newIsOpen = !folderInterface.isOpen;

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
            isOpen: newIsOpen,
          },
        }),
        { path: "/" }
      );
    } catch (error) {
      clientLogger.error(
        {
          logId: "thunk-folder:saveFolderOpenState:failedToSaveFolderStateToCookie",
          logValue: "Error saving folder state to cookie",
        },
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // Now dispatch the action to update the Redux store
    dispatch(folderToggleOpenClose({ uuid: folderUuid }));
  }
);

export const thunkToggleFolderVisible = appCreateAsyncThunk<{ folderUuid: string }>(
  "thunkToggleFolderVisible",
  async ({ folderUuid }, { getState }) => {
    if (!getState().user.missionPerms?.permissions.edit) return;
    withMissionChange((m) => applyToggleFolderVisible(m, folderUuid));
  }
);
