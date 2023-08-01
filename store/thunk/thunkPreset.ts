import { generateUniqueName } from "utils/names/unique-name";
import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { setRightPanelOpen } from "store/interface";
import {
  upsertPreset,
  setPresetEditMode,
  setSelectedPresetUuid,
  setPresetUIStates,
  duplicatePreset,
  setSelectedPresetRightNavItem,
  deletePreset,
  resetAllPresetUIStates,
  setPresetsFromDb,
} from "store/preset";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import * as InternalAPI from "http-client/preset";
import _ from "lodash";

export const thunkSavePreset = appCreateAsyncThunk<{
  preset: Preset;
}>("presetSave", async ({ preset }, { dispatch, getState }) => {
  if (!preset) return;
  // upsert the changed Preset to the DB
  const upsertReponse = await InternalAPI.setPreset(preset);

  if (upsertReponse.status === "success") {
    // upsert the changed preset to the store
    dispatch(upsertPreset(upsertReponse.data));
    // update the preset in the store from the DB
    // get fresh copy of presets from DB
    const presetData = await InternalAPI.getPresets(getState().mission.mission?.id);
    if (presetData.data) {
      dispatch(setPresetsFromDb(presetData.data));
    }
  } else {
    throw new Error("Error upserting Presets: " + upsertReponse.message);
  }
  dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
  dispatch(resetAllPresetUIStates({ presetUuid: preset.uuid }));
});

export const thunkPresetCancel = appCreateAsyncThunk<{
  preset: Preset;
}>("presetCancel", async ({ preset }, { dispatch, getState }) => {
  const presetFromDb = getState().preset.presetsFromDb.find(
    (presetDb) => presetDb.uuid === preset.uuid
  );

  // if selected preset isn't in the db, delete it from the store
  if (!presetFromDb) {
    dispatch(deletePreset(preset));
    dispatch(setSelectedPresetUuid(null));
    dispatch(setRightPanelOpen(false));
  } else {
    // if selected Preset is in the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertPreset(presetFromDb));
  }
  dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
  dispatch(resetAllPresetUIStates({ presetUuid: preset.uuid }));
});

export const thunkDeletePreset = appCreateAsyncThunk<{
  preset: Preset;
}>("presetDelete", async ({ preset }, { dispatch, getState }) => {
  if (!preset) return;
  const presetFromDb = getState().preset.presetsFromDb.find(
    (presetDb) => presetDb.uuid === preset.uuid
  );

  // if the selected preset is in presetsFromDb then delete it from the db
  if (presetFromDb) {
    const missionId = getState().mission.mission?.id;
    // delete the preset from the DB via internal API call
    const deleteResponse = await InternalAPI.deletePreset(preset.uuid, missionId);
    if (deleteResponse.status === "success") {
      // remove the corresponding preset from the store
      dispatch(deletePreset(preset));
      dispatch(setSelectedPresetUuid(null));

      // get fresh copy of presets from DB
      const presetData = await InternalAPI.getPresets(missionId);
      if (presetData.data) {
        dispatch(setPresetsFromDb(presetData.data));
      }
    } else {
      console.error("Error deleting preset: " + deleteResponse.message);
    }
  } else {
    // if the selected preset is not in presetsFromDb then delete it from the store
    dispatch(deletePreset(preset));
    dispatch(setSelectedPresetUuid(null));
  }
  dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
  dispatch(setRightPanelOpen(false));
});

export const thunkCreatePreset = appCreateAsyncThunk<void>(
  "presetCreate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().preset.presets.map((item) => item.name),
    });

    //flatten all layers uuids from mission for a default ordering
    const defaultLayerOrder = getState().mission.layers.map((headerLayer) => {
      const presetLayerOrder: PresetLayerOrder = {
        headerLayerUuid: headerLayer.uuid,
        sublayerUuids: [],
      };
      headerLayer.layerConfig.sublayers.forEach((sublayer) => {
        presetLayerOrder.sublayerUuids.push(sublayer.uuid); //add sublayers
      });
      return presetLayerOrder;
    });

    const blankPreset: Preset = {
      uuid: uuidv4(),
      name: randomName,
      description: "",
      ownerId: null,
      missionId: getState().mission.mission?.id,
      missionPreset: false,
      missionPresetDefault: false,
      layerOrder: defaultLayerOrder,
      mapLayerControls: getState().map.mapLayerControls,
      mapCircleControls: getState().map.mapCircleControls,
    };

    dispatch(upsertPreset(blankPreset));
    // turn on edit mode for the new POI
    dispatch(setPresetEditMode({ presetUuid: blankPreset.uuid, editMode: true }));
    // select the newly created POI
    dispatch(setSelectedPresetUuid(blankPreset.uuid));
    // open right panel
    dispatch(setRightPanelOpen(true));
    // create preset ui states entry
    const presetUIStates: PresetUIStates = {};
    for (const [key] of Object.entries(blankPreset.mapLayerControls)) {
      presetUIStates[key] = {
        expanded: true,
        tabSelected: null,
      };
    }
    for (const [key] of Object.entries(blankPreset.mapCircleControls)) {
      presetUIStates[key] = {
        expanded: true,
        tabSelected: null,
      };
    }
    dispatch(
      setPresetUIStates({
        presetUuid: blankPreset.uuid,
        presetUIStates: presetUIStates,
      })
    );
  }
);

export const thunkDuplicatePreset = appCreateAsyncThunk<{ preset: Preset }>(
  "presetDuplicate",
  async ({ preset }, { dispatch, getState }) => {
    if (!preset) return;
    //duplicate preset
    const newPreset: Preset = _.cloneDeep(preset);
    newPreset.uuid = uuidv4();
    newPreset.name = makeUniqueStringCopy(
      preset.name,
      getState().preset.presets.map((item) => item.name)
    );
    newPreset.missionPresetDefault = false; //never make a duplicate the default preset
    dispatch(duplicatePreset(newPreset));

    //dupcate preset ui state
    const newUIState: PresetUIStates = _.cloneDeep(getState().preset.presetsUIStates[preset.uuid]);
    dispatch(setPresetUIStates({ presetUuid: newPreset.uuid, presetUIStates: newUIState }));

    // open right panel
    dispatch(setRightPanelOpen(true));
    // set the selected tab to the POI's info tab
    dispatch(setSelectedPresetRightNavItem("info_panel"));
  }
);
