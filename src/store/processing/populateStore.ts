import { initialState as wholeStoreInitialState } from "store/index";
import { getAll } from "http-client/all";
import _ from "lodash";
import {
  auditActionDefinitions,
  auditActions,
  auditPosSources,
  auditPresetsAgainstLayers,
} from "./audits";

export const populateStore = async (params: {
  missionId: number;
  runAudit: boolean;
}): Promise<WholeStoreState> => {
  const { missionId, runAudit } = params;
  //get all data for a mission from a single endpoint
  const allDataRes: WrappedResponse<OneMissionToRuleThemAll> = await getAll(missionId);
  if (allDataRes.status !== "success" || !allDataRes.data) {
    return;
  } //gracefully handle an error if no data is returned?

  const wholeStoreState: WholeStoreState = _.cloneDeep(wholeStoreInitialState);
  wholeStoreState.action.actions = allDataRes.data.actions;
  wholeStoreState.action.actionsFromDb = allDataRes.data.actions;
  wholeStoreState.eva.evas = allDataRes.data.evas;
  wholeStoreState.eva.evasFromDb = allDataRes.data.evas;
  wholeStoreState.mission.mission = allDataRes.data.mission;
  wholeStoreState.mission.missionFromDb = allDataRes.data.mission;
  wholeStoreState.mission.layers = allDataRes.data.layers;
  wholeStoreState.mission.sublayers = allDataRes.data.sublayers;
  wholeStoreState.poi.pois = allDataRes.data.pois;
  wholeStoreState.poi.poisFromDb = allDataRes.data.pois;
  wholeStoreState.preset.presets = allDataRes.data.presets;
  wholeStoreState.preset.presetsFromDb = allDataRes.data.presets;
  wholeStoreState.rex.rexes = allDataRes.data.rexes;
  wholeStoreState.rex.rexesFromDb = allDataRes.data.rexes;
  wholeStoreState.station.stations = allDataRes.data.stations;
  wholeStoreState.station.stationsFromDb = allDataRes.data.stations;
  wholeStoreState.stm.level1s = allDataRes.data.level1s;
  wholeStoreState.stm.level2s = allDataRes.data.level2s;
  wholeStoreState.stm.level3s = allDataRes.data.level3s;
  wholeStoreState.stm.rules = allDataRes.data.stmRules;
  wholeStoreState.stm.rulesFromDb = allDataRes.data.stmRules;
  wholeStoreState.traverse.traverses = allDataRes.data.traverses;
  wholeStoreState.traverse.traversesFromDb = allDataRes.data.traverses;

  // Run audits on the data returned, modifying the data as needed. Each audit function will save needed changes to the DB
  if (runAudit) {
    await auditPresetsAgainstLayers({ wholeStoreState });
    await auditActionDefinitions({ wholeStoreState });
    await auditPosSources({ wholeStoreState });
  }

  // Set the default preset
  const defaultPreset = wholeStoreState.preset.presets.filter(
    (preset) => preset.missionPresetDefault === true
  );
  if (defaultPreset.length > 0) {
    wholeStoreState.preset.selectedPresetUuid = defaultPreset[0].uuid;
  }

  // Generate preset UI states for the store (not in the DB)
  generatePresetUIStates({ wholeStoreState });

  //If a rex is running, then switch the interface to show the rex pane and EVA actions right panel
  setRunningRexView({ wholeStoreState });

  /**
   * Audit actions
   * These are permanent checks that protect against changes made via admin
   */
  if (runAudit) await auditActions({ wholeStoreState });

  return wholeStoreState;
};

// If a rex is running, then switch the interface to show the rex pane and EVA actions right panel
export const setRunningRexView = (params: { wholeStoreState: WholeStoreState }): void => {
  const { wholeStoreState } = params;
  const runningRex = wholeStoreState.rex.rexes.find((rex) => rex.isRunning === true);
  if (runningRex) {
    wholeStoreState.rex.selectedRexUuid = runningRex.uuid;
    wholeStoreState.rex.expandedRexUuids = [runningRex.uuid];
    wholeStoreState.interface.rightPanelIsOpen = true;
    wholeStoreState.interface.sectionSelectedLabel = "rex";
    // Find the EVA UUID associated with the Rex and set it in the eva slice
    const evaUuid = wholeStoreState.rex.rexes.find((rex) => rex.uuid === runningRex.uuid)?.evaUuid;
    if (evaUuid) {
      wholeStoreState.eva.selectedEvaUuid = evaUuid;
      wholeStoreState.eva.selectedEvaRightNavItem = "actions_panel";
    }
  }
};

export const generatePresetUIStates = async (params: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const { wholeStoreState } = params;
  // Generate preset UI states
  const presetUuids = wholeStoreState.preset.presets.map((p) => p.uuid);
  presetUuids.forEach((presetUuid) => {
    //build preset ui states for the layer and sublayers
    const presetUIStates: PresetUIStates = {};
    for (const layer of wholeStoreState.mission?.layers) {
      if (!layer.uuid) continue;
      presetUIStates[layer.uuid] = {
        expanded: true,
        tabSelected: null,
        name: layer.name,
        type: "layer",
      };
    }
    for (const sublayer of wholeStoreState.mission?.sublayers) {
      presetUIStates[sublayer.uuid] = {
        expanded: true,
        tabSelected: null,
        name: sublayer.name,
        type: "sublayer",
      };
    }

    wholeStoreState.mission.mission?.landerRadii?.forEach((landerRadius) => {
      presetUIStates[landerRadius.uuid] = {
        expanded: true,
        tabSelected: null,
        name: landerRadius.name,
        type: "circle",
      };
    });

    wholeStoreState.preset.presetsUIStates[presetUuid] = presetUIStates;
  });
};
