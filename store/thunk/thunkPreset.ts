import { generateUniqueName } from "utils/names/unique-name";
import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import { setRightPanelOpen } from "store/interface";
import {
  upsertPreset,
  setPresetEditMode,
  setSelectedPresetUuid,
  setPresetUIStates,
  deletePresetByUuid,
  resetAllPresetUIStates,
  setPresetsFromDb,
  upsertPresetFromDb,
} from "store/preset";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import * as InternalAPI from "http-client/preset";
import { sortBy, cloneDeep } from "lodash";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { saveNewPreset } from "store/cross-slice";
import _ from "lodash";

export const thunkSavePreset = appCreateAsyncThunk<{
  preset: Preset;
}>("presetSave", async ({ preset }, { dispatch, getState }) => {
  if (!preset) return;
  //rex active?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

  // upsert the changed Preset to the DB
  const upsertReponse = await InternalAPI.upsertPresets(
    [
      {
        ...preset,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
    ],
    rexRunning
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
  preset: Preset;
}>("presetCancel", async ({ preset }, { dispatch, getState }) => {
  const presetFromDb = getState().preset.presetsFromDb.find(
    (presetDb) => presetDb.uuid === preset.uuid
  );

  // if selected preset isn't in the db, delete it from the store
  if (!presetFromDb) {
    dispatch(deletePresetByUuid(preset.uuid));
    dispatch(setSelectedPresetUuid(null));
    dispatch(setRightPanelOpen(false));
  } else {
    // if selected Preset is in the db, replace it with the one from the db (undoing any changes)
    dispatch(upsertPreset(presetFromDb, true));
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
  //rex active?
  const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;
  // if the selected preset is in presetsFromDb then delete it from the db
  if (presetFromDb) {
    const missionId = getState().mission.mission?.id;
    // delete the preset from the DB via internal API call
    const deleteResponse = await InternalAPI.deletePresets([preset.uuid], rexRunning);
    if (deleteResponse.status === "success") {
      // remove the corresponding preset from the store
      dispatch(deletePresetByUuid(preset.uuid));

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
    dispatch(deletePresetByUuid(preset.uuid));
  }
  dispatch(setPresetEditMode({ presetUuid: preset.uuid, editMode: false }));
  dispatch(setRightPanelOpen(false));
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
    for (const layer of sortBy(getState().mission.layers, ["name"])) {
      const sublayers: Sublayer[] = sortBy(
        getState().mission.sublayers.filter((s) => s.layerUuid === layer.uuid),
        ["name"]
      );
      defaultOrder.push({
        layerUuid: layer.uuid,
        sublayerUuids: sublayers.map((s) => s.uuid),
      });
    }

    const blankMapSublayerControls = _.cloneDeep(getState().map.mapSublayerControls);
    // make all sublayers invisible
    for (const [key] of Object.entries(blankMapSublayerControls)) {
      blankMapSublayerControls[key].visible = false;
    }

    const blankMapCircleControls = _.cloneDeep(getState().map.mapCircleControls);
    // make all circles invisible
    for (const [key] of Object.entries(blankMapCircleControls)) {
      blankMapCircleControls[key].visible = false;
    }

    const blankPreset: Preset = {
      uuid: uuidv4(),
      name: randomName,
      description: "",
      ownerId: null,
      missionId: getState().mission.mission?.id,
      missionPreset: false,
      missionPresetDefault: false,
      layerOrder: defaultOrder,
      mapSublayerControls: blankMapSublayerControls,
      mapCircleControls: blankMapCircleControls,
      updatedAt: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };
    dispatch(saveNewPreset(blankPreset));

    // create preset ui states entry
    const presetUIStates: PresetUIStates = {};
    for (const layer of getState().mission.layers) {
      presetUIStates[layer.uuid] = {
        expanded: true,
        tabSelected: null,
        name: layer.name,
        type: "layer",
      };
    }
    for (const sublayer of getState().mission.sublayers) {
      presetUIStates[sublayer.uuid] = {
        expanded: true,
        tabSelected: null,
        name: sublayer.name,
        type: "sublayer",
      };
    }
    for (const landerRadius of getState().mission.mission.landerRadii) {
      presetUIStates[landerRadius.uuid] = {
        expanded: true,
        tabSelected: null,
        name: landerRadius.name,
        type: "circle",
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
    const newPreset: Preset = cloneDeep(preset);
    newPreset.uuid = uuidv4();
    newPreset.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    newPreset.updatedAt = null;
    newPreset.name = makeUniqueStringCopy(
      preset.name,
      getState().preset.presets.map((item) => item.name)
    );
    newPreset.missionPresetDefault = false; //never make a duplicate the default preset
    dispatch(saveNewPreset(newPreset));

    //dupcate preset ui state
    const newUIState: PresetUIStates = cloneDeep(getState().preset.presetsUIStates[preset.uuid]);
    dispatch(setPresetUIStates({ presetUuid: newPreset.uuid, presetUIStates: newUIState }));
  }
);
