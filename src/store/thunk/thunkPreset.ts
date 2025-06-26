import { generateUniqueName } from "utils/names/unique-name";
import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import {
  upsertPresets,
  setPresetEditMode,
  setSelectedPresetUuid,
  setPresetLayerUIStates,
  setPresetCircleUIStates,
  deletePresetsByUuid,
  resetAllPresetLayersUIStates,
  resetAllPresetCirclesUIStates,
  upsertPresetsFromDb,
  deletePresetsFromDbByUuid,
  deletePresetLayersUIStates,
  deletePresetCirclesUIStates,
  selectPreset,
} from "store/preset";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import * as httpClient_preset from "http-client/preset";
import cloneDeep from "lodash/cloneDeep";
import sortBy from "lodash/sortBy";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankPreset } from "store/storeUtils/preset";
import { thunkAddRemoveFolderItem } from "./thunkFolder";

export const thunkSavePreset = appCreateAsyncThunk<{
  preset: Preset;
}>("presetSave", async ({ preset }, { dispatch }) => {
  if (!preset) return;

  // upsert the changed Preset to the DB
  const updatedPreset = {
    ...preset,
    updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
  };
  const upsertReponse = await httpClient_preset.upsertPresets([updatedPreset]);

  if (upsertReponse.status !== "success") {
    throw new Error("Error upserting Presets: " + upsertReponse.message);
  }

  // upsert the changed preset to the store
  dispatch(upsertPresets([updatedPreset], true));
  // update the preset in the store from the DB
  dispatch(upsertPresetsFromDb([updatedPreset]));
  dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
  dispatch(resetAllPresetLayersUIStates({ presetUuid: preset.uuid }));
  dispatch(resetAllPresetCirclesUIStates({ presetUuid: preset.uuid }));
});

export const thunkPresetCancel = appCreateAsyncThunk<{
  presetUuid: string;
}>("presetCancel", async ({ presetUuid }, { dispatch, getState }) => {
  const presetFromDb = getState().preset.presetsFromDb.find(
    (presetDb) => presetDb.uuid === presetUuid
  );

  // if selected preset isn't in the db, delete it from the store
  if (!presetFromDb) {
    dispatch(deletePresetsByUuid([presetUuid]));
    dispatch(setSelectedPresetUuid(null));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    dispatch(deletePresetLayersUIStates({ presetUuid }));
    dispatch(deletePresetCirclesUIStates({ presetUuid }));
    // reselect the default
    const defaultPresetUuid = getState().preset.presets.find((p) => p.missionDefault)?.uuid;
    dispatch(setSelectedPresetUuid(defaultPresetUuid));
    // remove the preset from any folder
    dispatch(
      thunkAddRemoveFolderItem({
        itemUuid: presetUuid,
        folderUuid: null,
      })
    );
  } else {
    // if selected Preset is in the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertPresets([presetFromDb], true));
    dispatch(resetAllPresetLayersUIStates({ presetUuid }));
    dispatch(resetAllPresetCirclesUIStates({ presetUuid }));
  }
  dispatch(setPresetEditMode({ presetUuid: presetUuid, editMode: false }));
});

export const thunkDeletePreset = appCreateAsyncThunk<{
  presetUuid: string;
}>("presetDelete", async ({ presetUuid }, { dispatch, getState }) => {
  if (!presetUuid) return;
  const presetFromDb = getState().preset.presetsFromDb.find(
    (presetDb) => presetDb.uuid === presetUuid
  );

  // if the selected preset is in presetsFromDb then delete it from the db
  if (presetFromDb) {
    // delete the preset from the DB via internal API call
    const deleteResponse = await httpClient_preset.deletePresets([presetUuid]);
    if (deleteResponse.status === "success") {
      // remove the corresponding preset from the store
      dispatch(deletePresetsByUuid([presetUuid]));
      dispatch(deletePresetsFromDbByUuid([presetUuid]));
    } else {
      console.error("Error deleting preset: " + deleteResponse.message);
    }
  } else {
    // if the selected preset is not in presetsFromDb then delete it from the store
    dispatch(deletePresetsByUuid([presetUuid]));
  }
  dispatch(
    thunkAddRemoveFolderItem({
      itemUuid: presetUuid,
      folderUuid: null,
    })
  );
  dispatch(setPresetEditMode({ presetUuid: presetUuid, editMode: false }));
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
  const defaultPresetUuid = getState().preset.presets.find((p) => p.missionDefault)?.uuid;
  dispatch(setSelectedPresetUuid(defaultPresetUuid));
});

export const thunkCreatePreset = appCreateAsyncThunk<void>(
  "presetCreate",
  async (__, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: getState().preset.presets.map((item) => item.name),
    });

    //create ordering by name
    const defaultOrder: PresetLayerOrder[] = [];
    for (const layer of sortBy(getState().mission.layers, [(layer) => layer.name.toLowerCase()])) {
      const sublayers: Sublayer[] = sortBy(
        getState().mission.sublayers.filter((s) => s.layerUuid === layer.uuid),
        [(sublayer) => sublayer.name.toLowerCase()]
      );
      defaultOrder.push({
        layerUuid: layer.uuid,
        sublayerUuids: sublayers.map((s) => s.uuid),
      });
    }

    // build sublayer controls
    const blankMapSublayerControls: MapSublayerControls = {};
    for (const sublayer of getState().mission.sublayers) {
      blankMapSublayerControls[sublayer.uuid] = {
        name: sublayer.name,
        sublayerUuid: sublayer.uuid,
        visible: false,
        style: {
          opacity: sublayer.style.opacity || 1,
          contrast: sublayer.style.contrast || 1,
          brightness: sublayer.style.brightness || 1,
          saturation: sublayer.style.saturation || 1,
          blendMode: sublayer.style.blendMode || "normal",
          color: sublayer.style.color || "#FFFFFF",
          weight: sublayer.style.weight || 1,
          fillColor: sublayer.style.fillColor || "#FFFFFF",
          fillOpacity: sublayer.style.fillOpacity || 0,
        },
      };
    }

    // build circle controls
    const blankMapCircleControls: MapCircleControls = {};
    getState().mission.mission.circleDefinitions?.forEach((landerRadius) => {
      blankMapCircleControls[landerRadius.uuid] = {
        name: landerRadius.name,
        uuid: landerRadius.uuid,
        visible: false,
        style: {
          opacity: 1,
          contrast: 1,
          brightness: 1,
          saturation: 1,
          blendMode: "normal",
          color: "#FFFFFF",
          weight: 1,
          fillColor: "none",
          fillOpacity: 0,
        },
      };
    });

    const blankPreset = generateBlankPreset({
      name: randomName,
      missionId: getState().mission.mission?.id,
      layerOrder: defaultOrder,
      mapSublayerControls: blankMapSublayerControls,
      mapCircleControls: blankMapCircleControls,
    });
    dispatch(upsertPresets([blankPreset]));
    dispatch(selectPreset({ uuid: blankPreset.uuid }));
    dispatch(setPresetEditMode({ presetUuid: blankPreset.uuid, editMode: true }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));

    // create preset layers ui states entry
    const presetLayerUIStates: LayerUIStates = {};

    if (getState().mission.layers) {
      for (const layer of getState().mission.layers) {
        presetLayerUIStates[layer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: layer.name,
          type: "layer",
        };
      }
    }
    if (getState().mission.sublayers) {
      for (const sublayer of getState().mission.sublayers) {
        presetLayerUIStates[sublayer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: sublayer.name,
          type: "sublayer",
        };
      }
    }
    dispatch(
      setPresetLayerUIStates({
        presetUuid: blankPreset.uuid,
        layerUIStates: presetLayerUIStates,
      })
    );

    // create preset circles ui states entry
    const presetCircleUIStates: CircleUIStates = {};

    if (getState().mission.mission.circleDefinitions) {
      for (const circleDefinition of getState().mission.mission.circleDefinitions) {
        presetCircleUIStates[circleDefinition.uuid] = {
          name: circleDefinition.name,
          slidersSelected: false,
        };
      }
    }

    dispatch(
      setPresetCircleUIStates({
        presetUuid: blankPreset.uuid,
        circleUIStates: presetCircleUIStates,
      })
    );
  }
);

export const thunkDuplicatePreset = appCreateAsyncThunk<{ presetUuid: string }>(
  "presetDuplicate",
  async ({ presetUuid }, { dispatch, getState }) => {
    if (!presetUuid) return;

    const preset = getState().preset.presets.find((p) => p.uuid === presetUuid);
    //duplicate preset
    const newPreset: Preset = cloneDeep(preset);
    newPreset.uuid = uuidv4();
    newPreset.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newPreset.updatedAt = null;
    newPreset.name = makeUniqueStringCopy(
      preset.name,
      getState().preset.presets.map((item) => item.name)
    );
    newPreset.missionDefault = false; //never make a duplicate the default preset

    dispatch(upsertPresets([newPreset]));
    dispatch(upsertPresetsFromDb([newPreset]));
    const upsertPresetsResponse = await httpClient_preset.upsertPresets([newPreset]);
    if (upsertPresetsResponse.status !== "success") {
      throw new Error("Error upserting Presets: " + upsertPresetsResponse.message);
    }
    dispatch(selectPreset({ uuid: newPreset.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));

    //duplicate preset layers ui state
    const newPresetLayerUIStates: LayerUIStates = cloneDeep(
      getState().preset.presetLayersUIStates[preset.uuid]
    );
    dispatch(
      setPresetLayerUIStates({
        presetUuid: newPreset.uuid,
        layerUIStates: newPresetLayerUIStates,
      })
    );

    //duplicate preset circles ui state
    const newPresetCircleUIState: CircleUIStates = cloneDeep(
      getState().preset.presetCirclesUIStates[preset.uuid]
    );
    dispatch(
      setPresetCircleUIStates({
        presetUuid: newPreset.uuid,
        circleUIStates: newPresetCircleUIState,
      })
    );
  }
);
