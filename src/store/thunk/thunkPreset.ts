import { generateUniqueName } from "utils/names/unique-name";
import appCreateAsyncThunk from "./thunkUtil";
import { v4 as uuidv4 } from "uuid";
import {
  setSelectedPresetUuid,
  setPresetLayerUIStates,
  setPresetCircleUIStates,
  deletePresetLayersUIStates,
  deletePresetCirclesUIStates,
  selectPreset,
  setAllPresetCirclesUIStates,
} from "store/preset";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import cloneDeep from "lodash/cloneDeep";
import sortBy from "lodash/sortBy";
import { getAccurateNow } from "utils/formatting";
import { thunkSetRightPanelIsOpenIfAuto } from "./thunkInterface";
import { generateBlankPreset } from "store/storeUtils/preset";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { getMissionDocHandle, withMissionChange } from "client/automergeDocHandles";
import {
  applyDeletePreset,
  applySyncPresetsWithCircleDefinitions,
  applyUpsertPreset,
} from "operations/apply/apply-mission-preset";

/** Uuid of the mission-default preset, if any. */
export const getMissionDefaultPresetUuid = (mission: Mission | undefined): string | null =>
  Object.values(mission?.presets ?? {}).find((preset) => preset.missionDefault)?.uuid ?? null;

/** Build the preset layers UI states (expanded headers) for a mission's layers. */
export const buildPresetLayerUIStates = (mission: Mission): LayerUIStates => {
  const presetLayerUIStates: LayerUIStates = {};
  for (const layer of Object.values(mission.layers ?? {})) {
    presetLayerUIStates[layer.uuid] = {
      expanded: true,
      tabSelected: null,
      name: layer.name,
      type: "layer",
    };
  }
  for (const sublayer of Object.values(mission.sublayers ?? {})) {
    presetLayerUIStates[sublayer.uuid] = {
      expanded: true,
      tabSelected: null,
      name: sublayer.name,
      type: "sublayer",
    };
  }
  return presetLayerUIStates;
};

/** Build the preset circle UI states for a mission's circle definitions. */
export const buildPresetCircleUIStates = (mission: Mission): CircleUIStates => {
  const presetCircleUIStates: CircleUIStates = {};
  for (const uuid of Object.keys(mission.circleDefinitions ?? {})) {
    presetCircleUIStates[uuid] = { slidersSelected: false };
  }
  return presetCircleUIStates;
};

export const thunkDeletePreset = appCreateAsyncThunk<{
  presetUuid: string;
}>("presetDelete", async ({ presetUuid }, { dispatch }) => {
  if (!presetUuid) return;
  // Deleting the preset also removes it from its folder
  withMissionChange((m) => applyDeletePreset(m, presetUuid));
  dispatch(deletePresetLayersUIStates({ presetUuid }));
  dispatch(deletePresetCirclesUIStates({ presetUuid }));
  dispatch(thunkSetRightPanelIsOpenIfAuto(false));
  dispatch(setSelectedPresetUuid(getMissionDefaultPresetUuid(getMissionDocHandle()?.doc())));
});

export const thunkCreatePreset = appCreateAsyncThunk<void>(
  "presetCreate",
  async (__, { dispatch }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;
    const mission = missionDocHandle.doc();
    const missionLayers = Object.values(mission.layers ?? {});
    const missionSublayers = Object.values(mission.sublayers ?? {});

    const randomName = generateUniqueName({
      dictName: "colors",
      existingNames: Object.values(mission.presets ?? {}).map((item) => item.name),
    });

    //create ordering by name
    const defaultOrder: PresetLayerOrder[] = [];
    for (const layer of sortBy(missionLayers, [(layer) => layer.name.toLowerCase()])) {
      const sublayers: Sublayer[] = sortBy(
        missionSublayers.filter((s) => s.layerUuid === layer.uuid),
        [(sublayer) => sublayer.name.toLowerCase()]
      );
      defaultOrder.push({
        layerUuid: layer.uuid,
        sublayerUuids: sublayers.map((s) => s.uuid),
      });
    }

    // build sublayer controls
    const blankMapSublayerControls: MapSublayerControls = {};
    for (const sublayer of missionSublayers) {
      blankMapSublayerControls[sublayer.uuid] = {
        name: sublayer.name,
        sublayerUuid: sublayer.uuid,
        visible: false,
        style: { ...defaultSublayerStyle },
      };
    }

    // build circle controls
    const blankMapCircleControls: MapCircleControls = {};
    for (const uuid of Object.keys(mission.circleDefinitions ?? {})) {
      blankMapCircleControls[uuid] = {
        uuid: uuid,
        visible: false,
        style: { ...defaultSublayerStyle },
      };
    }

    const blankPreset = generateBlankPreset({
      name: randomName,
      missionId: mission.id,
      ownerId: null,
      layerOrder: defaultOrder,
      mapSublayerControls: blankMapSublayerControls,
      mapCircleControls: blankMapCircleControls,
    });
    withMissionChange((m) => applyUpsertPreset(m, blankPreset));
    dispatch(
      setPresetLayerUIStates({
        presetUuid: blankPreset.uuid,
        layerUIStates: buildPresetLayerUIStates(mission),
      })
    );
    dispatch(
      setPresetCircleUIStates({
        presetUuid: blankPreset.uuid,
        circleUIStates: buildPresetCircleUIStates(mission),
      })
    );
    dispatch(selectPreset({ uuid: blankPreset.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
);

export const thunkDuplicatePreset = appCreateAsyncThunk<{ presetUuid: string }>(
  "presetDuplicate",
  async ({ presetUuid }, { dispatch, getState }) => {
    if (!presetUuid) return;
    const mission = getMissionDocHandle()?.doc();
    const preset = mission?.presets?.[presetUuid];
    if (!preset) return;

    //duplicate preset
    const newPreset: Preset = JSON.parse(JSON.stringify(preset));
    newPreset.uuid = uuidv4();
    newPreset.createdAt = getAccurateNow().getTime();
    newPreset.updatedAt = newPreset.createdAt;
    newPreset.name = makeUniqueStringCopy(
      preset.name,
      Object.values(mission.presets).map((item) => item.name)
    );
    newPreset.missionDefault = false; //never make a duplicate the default preset

    withMissionChange((m) => applyUpsertPreset(m, newPreset));

    //duplicate preset layers ui state
    const newPresetLayerUIStates: LayerUIStates =
      cloneDeep(getState().preset.presetLayersUIStates[preset.uuid]) ??
      buildPresetLayerUIStates(mission);
    dispatch(
      setPresetLayerUIStates({
        presetUuid: newPreset.uuid,
        layerUIStates: newPresetLayerUIStates,
      })
    );

    //duplicate preset circles ui state
    const newPresetCircleUIState: CircleUIStates =
      cloneDeep(getState().preset.presetCirclesUIStates[preset.uuid]) ??
      buildPresetCircleUIStates(mission);
    dispatch(
      setPresetCircleUIStates({
        presetUuid: newPreset.uuid,
        circleUIStates: newPresetCircleUIState,
      })
    );
    dispatch(selectPreset({ uuid: newPreset.uuid }));
    dispatch(thunkSetRightPanelIsOpenIfAuto(true));
  }
);

// when mission circle definitions change, update the circle controls in every preset
export const thunkSyncPresetsWithMission = appCreateAsyncThunk<void>(
  "presetSyncWithMission",
  async (_, { dispatch, getState }) => {
    const missionDocHandle = getMissionDocHandle();
    if (!missionDocHandle) return;

    withMissionChange((m) => applySyncPresetsWithCircleDefinitions(m));

    // Sync the preset circle UI states with the circle definitions
    const mission = missionDocHandle.doc();
    const newCirclesUIStates: CirclesUIStates = {};
    for (const preset of Object.values(mission.presets ?? {})) {
      const newPresetCircleUIStates: CircleUIStates =
        cloneDeep(getState().preset.presetCirclesUIStates[preset.uuid]) || {};
      for (const uuid of Object.keys(mission.circleDefinitions ?? {})) {
        if (!newPresetCircleUIStates[uuid])
          newPresetCircleUIStates[uuid] = { slidersSelected: false };
      }
      for (const uuid of Object.keys(newPresetCircleUIStates)) {
        if (!mission.circleDefinitions?.[uuid]) delete newPresetCircleUIStates[uuid];
      }
      newCirclesUIStates[preset.uuid] = newPresetCircleUIStates;
    }
    dispatch(setAllPresetCirclesUIStates({ circlesUIStates: newCirclesUIStates }));
  }
);
