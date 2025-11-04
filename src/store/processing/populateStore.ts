import { initialState as wholeStoreInitialState } from "store/index";
import { getAll } from "http-client/all";
import cloneDeep from "lodash/cloneDeep";
import Cookies from "js-cookie";
import {
  auditActionDefinitions,
  auditActions,
  auditPresetsAgainstLayers,
  auditFolders,
} from "./audits";

export const populateStore = async (params: {
  missionId: number;
  runAudit: boolean;
  loadTestOptions?: {
    // used for load testing ONLY
    serverURL?: string;
    cookies?: string;
  };
}): Promise<WholeStoreState> => {
  const { missionId, runAudit, loadTestOptions: externalOptions } = params;
  //get all data for a mission from a single endpoint
  const allDataRes: WrappedResponse<OneMissionToRuleThemAll> = await getAll(
    missionId,
    externalOptions
  );
  if (allDataRes.status !== "success" || !allDataRes.data) {
    return;
  } //gracefully handle an error if no data is returned?

  const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);
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
  wholeStoreState.interface.folders = allDataRes.data.folders;

  // Generate folders interface states for the store (using cookies if available)
  generateFoldersInterfaceStates({ wholeStoreState });

  // These values are from the vite.config.mts file and are set at build time
  // However when running a load test where this file is spun up on the server, these are set in the esbuild.mjs file
  wholeStoreState.interface.appVersion = {
    version: __APP_VERSION__,
    gitCommit: __GIT_COMMIT__,
  };

  // Run audits on the data returned, modifying the data as needed. Each audit function will save needed changes to the DB
  if (runAudit) {
    await auditPresetsAgainstLayers({ wholeStoreState });
    await auditActionDefinitions({ wholeStoreState });
    await auditFolders({ wholeStoreState });
    await auditActions({ wholeStoreState });
  }

  // Set the default preset
  const defaultPreset = wholeStoreState.preset.presets.filter(
    (preset) => preset.missionDefault === true
  );
  if (defaultPreset.length > 0) {
    wholeStoreState.preset.selectedPresetUuid = defaultPreset[0].uuid;
  }

  // Generate preset layers UI states for the store (not in the DB)
  generatePresetsLayersUIStates({ wholeStoreState });

  // Generate preset circles UI states for the store (not in the DB)
  generatePresetsCirclesUIStates({ wholeStoreState });

  // Generate station circles UI states for the store (not in the DB)
  generateStationsCirclesUIStates({ wholeStoreState });

  // Generate eva dropdown selected state for the store (not in the DB)
  generateEvaDropdownUIStates({ wholeStoreState });

  //If a rex is running, then switch the interface to show the rex pane and EVA actions right panel
  setRunningRexView({ wholeStoreState });

  return wholeStoreState;
};

// If a rex is running, then switch the interface to show the rex pane and EVA actions right panel
export const setRunningRexView = (params: { wholeStoreState: WholeStoreState }): void => {
  const { wholeStoreState } = params;
  const runningRex = wholeStoreState.rex.rexes.find((rex) => rex.isRunning === true);
  if (runningRex) {
    wholeStoreState.interface.rightPanelIsOpen = true;
    wholeStoreState.interface.sectionSelectedLabel = "evas";
    wholeStoreState.eva.showRunningRexOnly = true;
    wholeStoreState.rex.selectedRexUuid = runningRex.uuid;
    // Find the EVA UUID associated with the Rex
    const evaUuid = wholeStoreState.rex.rexes.find((rex) => rex.uuid === runningRex.uuid)?.evaUuid;
    if (evaUuid) {
      // select the EVA and open up the actions panel
      wholeStoreState.eva.selectedEvaUuid = evaUuid;
      wholeStoreState.eva.selectedEvaRightNavItem = "actions_panel";
      // expand the as-planned version and set it in the eva dropdown
      const allRexEvas = wholeStoreState.rex.rexes.map((rex) => rex.evaUuid);
      const evaRefUuid = wholeStoreState.eva.evas.find((e) => e.uuid === evaUuid)?.refUuid;
      const asPlannedEvaUuid = wholeStoreState.eva.evas.find(
        (e) => e.refUuid === evaRefUuid && !allRexEvas.includes(e.uuid)
      )?.uuid;
      wholeStoreState.eva.expandedEvaUuids = [asPlannedEvaUuid];
      wholeStoreState.eva.evaDropdownUIStates[asPlannedEvaUuid] = evaUuid;
    }
  }
};

const generatePresetsLayersUIStates = async (params: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const { wholeStoreState } = params;
  // Generate preset UI states
  const presetUuids = wholeStoreState.preset.presets.map((p) => p.uuid);
  presetUuids.forEach((presetUuid) => {
    //build preset ui states for the layer and sublayers
    const presetLayerUIStates: LayerUIStates = {};
    for (const layer of wholeStoreState.mission?.layers) {
      if (!layer.uuid) continue;
      presetLayerUIStates[layer.uuid] = {
        expanded: true,
        tabSelected: null,
        name: layer.name,
        type: "layer",
      };
    }
    for (const sublayer of wholeStoreState.mission?.sublayers) {
      presetLayerUIStates[sublayer.uuid] = {
        expanded: true,
        tabSelected: null,
        name: sublayer.name,
        type: "sublayer",
      };
    }

    wholeStoreState.preset.presetLayersUIStates[presetUuid] = presetLayerUIStates;
  });
};

const generatePresetsCirclesUIStates = async (params: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const { wholeStoreState } = params;
  // Generate preset UI states
  const presetUuids = wholeStoreState.preset.presets.map((p) => p.uuid);
  presetUuids.forEach((presetUuid) => {
    //build preset ui states for the layer and sublayers
    const presetCircleUIStates: CircleUIStates = {};

    wholeStoreState.mission.mission?.circleDefinitions?.forEach((circleDef) => {
      presetCircleUIStates[circleDef.uuid] = {
        name: circleDef.name,
        slidersSelected: false,
      };
    });

    wholeStoreState.preset.presetCirclesUIStates[presetUuid] = presetCircleUIStates;
  });
};

const generateStationsCirclesUIStates = async (params: {
  wholeStoreState: WholeStoreState;
}): Promise<void> => {
  const { wholeStoreState } = params;
  // Generate station UI states
  const stationUuids = wholeStoreState.station.stations.map((s) => s.uuid);
  stationUuids.forEach((stationUuid) => {
    //build station ui states for the circles
    const stationCircleUIStates: CircleUIStates = {};

    wholeStoreState.mission.mission?.circleDefinitions?.forEach((circleDef) => {
      stationCircleUIStates[circleDef.uuid] = {
        name: circleDef.name,
        slidersSelected: false,
      };
    });

    wholeStoreState.station.stationCirclesUIStates[stationUuid] = stationCircleUIStates;
  });
};

const generateFoldersInterfaceStates = (params: { wholeStoreState: WholeStoreState }): void => {
  const { wholeStoreState } = params;
  try {
    const foldersInterfaceCookie: FoldersInterfaceCookie = JSON.parse(
      Cookies.get("AEGIS_Folders_Interface") || "{}"
    );

    wholeStoreState.interface.foldersInterface = wholeStoreState.interface.folders.map((folder) => {
      const savedState = foldersInterfaceCookie[folder.uuid];
      return {
        uuid: folder.uuid,
        isOpen: savedState?.isOpen ?? true,
        visible: savedState?.visible ?? true,
        editing: false,
        editingNameValue: null,
      } as FolderInterface;
    });
  } catch (error) {
    console.error("Error parsing folder interfaces from cookie:", error);
    // Create default folder interfaces if there's an error with the cookie
    wholeStoreState.interface.foldersInterface = wholeStoreState.interface.folders.map(
      (folder) =>
        ({
          uuid: folder.uuid,
          isOpen: true,
          visible: true,
          editing: false,
          editingNameValue: null,
        }) as FolderInterface
    );
  }
};

const generateEvaDropdownUIStates = (params: { wholeStoreState: WholeStoreState }): void => {
  const { wholeStoreState } = params;
  //get list of all as-planned evas
  const rexEvas = wholeStoreState.rex.rexes.map((rex) => rex.evaUuid);
  const asPlannedEvas = wholeStoreState.eva.evas.filter((e) => !rexEvas.includes(e.uuid));
  for (const eva of asPlannedEvas) {
    wholeStoreState.eva.evaDropdownUIStates[eva.uuid] = eva.uuid;
  }
};
