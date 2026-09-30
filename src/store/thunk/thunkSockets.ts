import appCreateAsyncThunk from "./thunkUtil";
import {
  deletePresetsByUuid,
  deletePresetsFromDbByUuid,
  setPresetEditMode,
  setSelectedPresetUuid,
  upsertPresets,
  upsertPresetsFromDb,
} from "store/preset";
import {
  deleteSTMRules,
  deleteSTMRulesFromDb,
  setRuleEditingUuid,
  upsertSTMRules,
  upsertSTMRulesFromDb,
} from "store/stm";
import {
  setFolders,
  setFolderInterfaceEditing,
  setFolderInterfaceNameValue,
} from "store/interface";
import cloneDeep from "lodash/cloneDeep";

/**
 * Handles the storeUpsert socket event
 */
export const thunkSocketsHandleUpsert = appCreateAsyncThunk<
  {
    storeUpsert: StoreUpsert;
  },
  string[]
>("thunkSocketsHandleUpsert", async ({ storeUpsert }, { dispatch, getState }) => {
  const upsertMessages: string[] = [];

  if (storeUpsert.type === "preset") {
    const changedPresets = storeUpsert.data as Preset[];
    for (const changedPreset of changedPresets) {
      if (getState().preset.presetsEditing.includes(changedPreset.uuid)) {
        upsertMessages.push(getConflictMessage("preset", changedPreset.name, "upsert"));
        dispatch(setPresetEditMode({ presetUuid: changedPreset.uuid, editMode: false }));
      }
    }
    dispatch(upsertPresets(changedPresets, true));
    dispatch(upsertPresetsFromDb(changedPresets));
  } else if (storeUpsert.type === "stmRule") {
    const changedStmRules = storeUpsert.data as STMRule[];
    for (const changedStmRule of changedStmRules) {
      if (getState().stm.ruleEditingUuid === changedStmRule.uuid) {
        upsertMessages.push("The STM rules you are editing was changed by another user.");
        dispatch(setRuleEditingUuid(null));
      }
    }
    dispatch(upsertSTMRules(changedStmRules, true));
    dispatch(upsertSTMRulesFromDb(changedStmRules));
  } else if (storeUpsert.type === "folder") {
    const changedFolders = storeUpsert.data as Folder[];
    for (const changedFolder of changedFolders) {
      if (
        getState().interface.foldersInterface.find((f) => f.uuid === changedFolder.uuid)?.editing
      ) {
        upsertMessages.push(getConflictMessage("folder", changedFolder.name, "upsert"));
        dispatch(setFolderInterfaceEditing({ folderUuid: changedFolder.uuid, editing: false }));
        dispatch(
          setFolderInterfaceNameValue({
            folderUuid: changedFolder.uuid,
            editingNameValue: null,
          })
        );
      }
    }

    const allFolders = cloneDeep(getState().interface.folders) as Folder[];
    // Update existing folders with the new data
    allFolders.forEach((folder, index) => {
      const changedFolder = changedFolders.find((f) => f.uuid === folder.uuid);
      if (changedFolder) {
        allFolders[index] = changedFolder;
      }
    });

    // Add new folders
    changedFolders.forEach((changedFolder) => {
      if (!allFolders.find((f) => f.uuid === changedFolder.uuid)) {
        allFolders.push(changedFolder);
      }
    });

    dispatch(setFolders(allFolders));
  } else {
    throw new Error(`Unhandled storeUpsert type: ${storeUpsert.type}`);
  }
  return upsertMessages;
});

/**
 * Handles the storeDelete socket event
 */
export const thunkSocketsHandleDelete = appCreateAsyncThunk<
  {
    storeDelete: StoreDelete;
  },
  string[]
>("thunkSocketsHandleDelete", async ({ storeDelete }, { dispatch, getState }) => {
  const deletedMessages: string[] = [];

  if (storeDelete.type === "preset") {
    for (const deletedUuid of storeDelete.uuids) {
      if (getState().preset.presetsEditing.includes(deletedUuid)) {
        const deletedPreset = getState().preset.presets.find(
          (preset) => preset.uuid === deletedUuid
        );
        deletedMessages.push(getConflictMessage("preset", deletedPreset.name, "delete"));
        dispatch(setPresetEditMode({ presetUuid: deletedPreset.uuid, editMode: false }));
      }
      if (getState().preset.selectedPresetUuid === deletedUuid) {
        // Set the selected preset to the default preset
        const defaultPreset = getState().preset.presets.find(
          (thisPreset) => thisPreset.missionDefault === true
        ) as Preset;
        dispatch(setSelectedPresetUuid(defaultPreset.uuid));
      }
    }
    dispatch(deletePresetsByUuid(storeDelete.uuids));
    dispatch(deletePresetsFromDbByUuid(storeDelete.uuids));
  } else if (storeDelete.type === "stmRule") {
    for (const deletedUuid of storeDelete.uuids) {
      if (getState().stm.ruleEditingUuid === deletedUuid) {
        deletedMessages.push("The STM rules you are editing was deleted by another user.");
        dispatch(setRuleEditingUuid(null));
      }
    }
    dispatch(deleteSTMRules(storeDelete.uuids));
    dispatch(deleteSTMRulesFromDb(storeDelete.uuids));
  } else if (storeDelete.type === "folder") {
    const allFolders = cloneDeep(getState().interface.folders) as Folder[];
    for (const deletedUuid of storeDelete.uuids) {
      const deletedFolder = allFolders.find((f) => f.uuid === deletedUuid);
      if (deletedFolder) {
        if (getState().interface.foldersInterface.find((f) => f.uuid === deletedUuid)?.editing) {
          deletedMessages.push(getConflictMessage("folder", deletedFolder.name, "delete"));
          dispatch(setFolderInterfaceEditing({ folderUuid: deletedFolder.uuid, editing: false }));
          dispatch(
            setFolderInterfaceNameValue({
              folderUuid: deletedFolder.uuid,
              editingNameValue: null,
            })
          );
        }
      }
    }

    // The enhanced setFolders action will handle interfaces automatically
    dispatch(setFolders(allFolders.filter((f) => !storeDelete.uuids.includes(f.uuid))));
  }
  return deletedMessages;
});

const getConflictMessage = (type: string, name: string, action: string): string => {
  const actionPastTense = action === "upsert" ? "changed" : "deleted";
  return `The ${type} ${name} that you were editing has been ${actionPastTense} by another user. Your unsaved changes have been discarded.`;
};
