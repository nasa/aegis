import { generateUniqueName } from "utils/names/unique-name";
import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import {
  upsertPreset,
  setPresetEditMode,
  setSelectedPresetUuid,
  setPresetUIStates,
  deletePresetByUuid,
  resetAllPresetUIStates,
  upsertPresetFromDb,
  deletePresetFromDbByUuid,
  deletePresetUIStates,
} from "store/preset";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import * as httpClient_preset from "http-client/preset";
import { sortBy, cloneDeep } from "lodash";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { thunkSaveNewPreset } from "./crossThunk";
import _ from "lodash";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankPreset } from "store/storeUtils/preset";

export const thunkSavePreset = appCreateAsyncThunk<{
  preset: Preset;
}>("presetSave", async ({ preset }, { dispatch, getState }) => {
  if (!preset) return;
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

  // upsert the changed Preset to the DB
  const upsertReponse = await httpClient_preset.upsertPresets(
    [
      {
        ...preset,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    isRexRunning
  );

  if (upsertReponse.status === "success") {
    // upsert the changed preset to the store
    dispatch(upsertPreset(upsertReponse.data[0], true));
    // update the preset in the store from the DB
    dispatch(upsertPresetFromDb(upsertReponse.data[0]));
  } else {
    throw new Error("Error upserting Presets: " + upsertReponse.message);
  }
  dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
  dispatch(resetAllPresetUIStates({ presetUuid: preset.uuid }));
});

export const thunkPresetCancel = appCreateAsyncThunk<{
  presetUuid: string;
}>("presetCancel", async ({ presetUuid }, { dispatch, getState }) => {
  const presetFromDb = getState().preset.presetsFromDb.find(
    (presetDb) => presetDb.uuid === presetUuid
  );

  // if selected preset isn't in the db, delete it from the store
  if (!presetFromDb) {
    dispatch(deletePresetByUuid(presetUuid));
    dispatch(setSelectedPresetUuid(null));
    dispatch(thunkSetRightPanelIsOpenIfAuto(false));
    dispatch(deletePresetUIStates({ presetUuid }));
    // reselect the default
    const defaultPresetUuid = getState().preset.presets.find((p) => p.missionPresetDefault)?.uuid;
    dispatch(setSelectedPresetUuid(defaultPresetUuid));
  } else {
    // if selected Preset is in the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertPreset(presetFromDb, true));
    dispatch(resetAllPresetUIStates({ presetUuid: presetUuid }));
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
  const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

  // if the selected preset is in presetsFromDb then delete it from the db
  if (presetFromDb) {
    // delete the preset from the DB via internal API call
    const deleteResponse = await httpClient_preset.deletePresets([presetUuid], isRexRunning);
    if (deleteResponse.status === "success") {
      // remove the corresponding preset from the store
      dispatch(deletePresetByUuid(presetUuid));
      dispatch(deletePresetFromDbByUuid(presetUuid));
    } else {
      console.error("Error deleting preset: " + deleteResponse.message);
    }
  } else {
    // if the selected preset is not in presetsFromDb then delete it from the store
    dispatch(deletePresetByUuid(presetUuid));
  }
  dispatch(setPresetEditMode({ presetUuid: presetUuid, editMode: false }));
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
  const defaultPresetUuid = getState().preset.presets.find((p) => p.missionPresetDefault)?.uuid;
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
          opacity: sublayer.opacity || 1,
          contrast: 1,
          brightness: 1,
          saturation: 1,
          blendMode: "normal",
          color: sublayer.color || "#FFFFFF",
          weight: sublayer.weight || 1,
          fillColor: sublayer.fillColor || "#FFFFFF",
          fillOpacity: sublayer.fillOpacity || 0,
        },
      };
    }

    // build circle controls
    const blankMapCircleControls: MapCircleControls = {};
    getState().mission.mission.landerRadii?.forEach((landerRadius) => {
      blankMapCircleControls[landerRadius.uuid] = {
        name: landerRadius.name,
        landerRadiusUuid: landerRadius.uuid,
        visible: false,
        style: {
          opacity: 1,
          contrast: 1,
          brightness: 1,
          saturation: 1,
          blendMode: "normal",
          color: "red",
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
    dispatch(thunkSaveNewPreset({ preset: blankPreset }));

    // create preset ui states entry
    const presetUIStates: PresetUIStates = {};
    if (getState().mission.layers) {
      for (const layer of getState().mission.layers) {
        presetUIStates[layer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: layer.name,
          type: "layer",
        };
      }
    }
    if (getState().mission.sublayers) {
      for (const sublayer of getState().mission.sublayers) {
        presetUIStates[sublayer.uuid] = {
          expanded: true,
          tabSelected: null,
          name: sublayer.name,
          type: "sublayer",
        };
      }
    }
    if (getState().mission.mission.landerRadii) {
      for (const landerRadius of getState().mission.mission.landerRadii) {
        presetUIStates[landerRadius.uuid] = {
          expanded: true,
          tabSelected: null,
          name: landerRadius.name,
          type: "circle",
        };
      }
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
    const newPreset: Preset = cloneDeep(preset);
    newPreset.uuid = uuidv4();
    newPreset.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newPreset.updatedAt = null;
    newPreset.name = makeUniqueStringCopy(
      preset.name,
      getState().preset.presets.map((item) => item.name)
    );
    newPreset.missionPresetDefault = false; //never make a duplicate the default preset
    dispatch(thunkSaveNewPreset({ preset: newPreset }));

    //dupcate preset ui state
    const newUIState: PresetUIStates = cloneDeep(getState().preset.presetsUIStates[preset.uuid]);
    dispatch(setPresetUIStates({ presetUuid: newPreset.uuid, presetUIStates: newUIState }));
  }
);
