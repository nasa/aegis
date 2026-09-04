import { initialState as wholeStoreInitialState } from "store/index";
import { getAll } from "http-client/all";
import cloneDeep from "lodash/cloneDeep";
import Cookies from "js-cookie";
import {
  auditActionDefinitions,
  auditActions,
  auditPresetsAgainstLayers,
  auditFolders,
  auditMissionGrid,
} from "./audits";
import { resolveAutomergeMission } from "http-client/docListing";
import type { DocHandle, Repo, AutomergeUrl } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { validateMission } from "utils/validateSchemaClient";
import { clientLogger } from "utils/logging/clientLogger";
import { acceptMissionDatabaseEpoch, closeMissionMutationGate } from "client/databaseEpoch";

// Populate the entire store state except User and Interface
// All api calls used in this function must past in the load test options
//   in order to work in a headless environment
export const populateStore = async (params: {
  missionId: number;
  runAudit: boolean;
  loadTestOptions?: {
    // used for load testing ONLY
    serverURL?: string;
    cookies?: string;
  };
  automergeRepo: Repo;
}): Promise<WholeStoreState> => {
  const { missionId, runAudit, loadTestOptions, automergeRepo } = params;
  // Get all data for a mission from a single endpoint
  const allDataRes: WrappedResponse<OneMissionToRuleThemAll> = await getAll(
    missionId,
    loadTestOptions
  );
  if (allDataRes.status !== "success" || !allDataRes.data) {
    return;
  } // Gracefully handle an error if no data is returned?

  const wholeStoreState: WholeStoreState = cloneDeep(wholeStoreInitialState);
  wholeStoreState.mission.layers = allDataRes.data.layers;
  wholeStoreState.mission.sublayers = allDataRes.data.sublayers;
  wholeStoreState.preset.presets = allDataRes.data.presets;
  wholeStoreState.preset.presetsFromDb = allDataRes.data.presets;
  wholeStoreState.stm.level1s = allDataRes.data.level1s;
  wholeStoreState.stm.level2s = allDataRes.data.level2s;
  wholeStoreState.stm.level3s = allDataRes.data.level3s;
  wholeStoreState.stm.rules = allDataRes.data.stmRules;
  wholeStoreState.stm.rulesFromDb = allDataRes.data.stmRules;
  wholeStoreState.interface.folders = allDataRes.data.folders;

  // Generate folders interface states for the store (using cookies if available)
  generateFoldersInterfaceStates({ wholeStoreState });

  // Close the mutation gate before fetching the resolution so that no
  // Automerge write can race with the fetch and land on an old document URL.
  closeMissionMutationGate();
  const resolutionResponse = await resolveAutomergeMission(missionId, loadTestOptions);
  const resolution = resolutionResponse.data;
  // The resolution response carries the server's current database epoch and
  // the canonical Automerge URL for the mission.  Validate all fields before
  // touching the Automerge repo — a mismatch here means the server is not
  // ready or the mission does not exist.
  if (
    resolutionResponse.status !== "success" ||
    resolution?.missionId !== missionId ||
    !resolution.databaseEpoch ||
    !isValidAutomergeUrl(resolution.automergeUrl)
  ) {
    throw new Error("Invalid Automerge URL");
  }
  wholeStoreState.mission.automergeUrl = resolution.automergeUrl;
  const missionDocHandle: DocHandle<Mission> = await automergeRepo.find(
    resolution.automergeUrl as AutomergeUrl
  );
  if (!missionDocHandle) {
    throw new Error("Mission doc handle not found in repo");
  }
  await missionDocHandle.whenReady();
  // Guard against the Automerge WebSocket repo serving a cached document
  // from a previous epoch whose URL happens to be reachable.
  if (missionDocHandle.doc().id !== missionId) {
    throw new Error("Resolved Automerge document has the wrong mission ID");
  }
  // Record the accepted epoch and reopen the gate — writes are safe from here.
  acceptMissionDatabaseEpoch(resolution.databaseEpoch, resolution.automergeUrl);
  setMissionAutomergeDocHandle(missionDocHandle); // Save doc handle to client global for future access

  // Get circle definitions from the mission automerge doc
  const mission = missionDocHandle.doc();
  const missionCircleDefinitions = mission.circleDefinitions;

  // Run audits on the data returned, modifying the data as needed. Each audit function will save needed changes
  // Require the automerge doc handle is ready since these audits need access to and update mission
  if (runAudit) {
    await auditPresetsAgainstLayers({ wholeStoreState });
    await auditActionDefinitions({ missionDocHandle });
    await auditFolders({ wholeStoreState, missionDocHandle });
    await auditActions({ wholeStoreState, missionDocHandle });
    await auditMissionGrid({ missionDocHandle });
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
  generatePresetsCirclesUIStates({ wholeStoreState, missionCircleDefinitions });

  // Generate station circles UI states for the store (not in the DB)
  // Lander stations are skipped: their circles come from the selected preset.
  const stationUuids = Object.values(mission?.stations ?? {})
    .filter((station) => !station.isLanderXgress)
    .map((station) => station.uuid);
  generateStationsCirclesUIStates({ wholeStoreState, missionCircleDefinitions, stationUuids });

  // Generate eva dropdown selected state from automerge evas (not in the DB)
  generateEvaDropdownUIStates({ wholeStoreState, mission });

  // If a rex is running, then switch the interface to show the rex pane and EVA actions right panel
  setRunningRexView({ wholeStoreState, mission });

  // Run a schema validator check on the mission data
  // Consider expanding this to all object types
  const updatedMission = missionDocHandle.doc();
  const validationErrors = await validateMission(updatedMission, loadTestOptions);
  if (validationErrors.length !== 0) {
    throw new Error(
      `Something went wrong in the audit function. Invalid mission schema: ${JSON.stringify(validationErrors)}`
    );
  }

  return wholeStoreState;
};

// If a rex is running, switch the interface to show the rex pane and EVA actions right panel
export const setRunningRexView = (params: {
  wholeStoreState: WholeStoreState;
  mission: Mission;
}): void => {
  const { wholeStoreState, mission } = params;
  const allRexes = Object.values(mission?.rexes ?? {});
  const runningRex = allRexes.find((rex) => rex.isRunning === true);
  if (runningRex) {
    wholeStoreState.interface.rightPanelIsOpen = true;
    wholeStoreState.interface.sectionSelectedLabel = "evas";
    wholeStoreState.eva.showRunningRexOnly = true;
    wholeStoreState.rex.selectedRexUuid = runningRex.uuid;
    // Find the EVA UUID associated with the Rex
    const evaUuid = runningRex.evaUuid;
    if (evaUuid) {
      const allEvas = Object.values(mission?.evas ?? {});
      // Select the EVA and open up the actions panel
      wholeStoreState.eva.selectedEvaUuid = evaUuid;
      wholeStoreState.eva.selectedEvaRightNavItem = "actions_panel";
      // Expand the as-planned version and set it in the eva dropdown
      const allRexEvas = allRexes.map((rex) => rex.evaUuid);
      const evaRefUuid = mission.evas[evaUuid]?.refUuid;
      const asPlannedEvaUuid = allEvas.find(
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
    // Build preset ui states for the layer and sublayers
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
  missionCircleDefinitions: CircleDefinitions;
}): Promise<void> => {
  const { wholeStoreState, missionCircleDefinitions } = params;
  // Generate preset UI states
  const presetUuids = wholeStoreState.preset.presets.map((p) => p.uuid);
  presetUuids.forEach((presetUuid) => {
    // Build preset ui states for the layer and sublayers
    const presetCircleUIStates: CircleUIStates = {};
    if (missionCircleDefinitions) {
      Object.entries(missionCircleDefinitions || {})?.forEach(([uuid]) => {
        presetCircleUIStates[uuid] = { slidersSelected: false };
      });
    }
    wholeStoreState.preset.presetCirclesUIStates[presetUuid] = presetCircleUIStates;
  });
};

const generateStationsCirclesUIStates = async (params: {
  wholeStoreState: WholeStoreState;
  missionCircleDefinitions: CircleDefinitions;
  stationUuids: string[];
}): Promise<void> => {
  const { wholeStoreState, missionCircleDefinitions, stationUuids } = params;
  // Generate station UI states
  stationUuids.forEach((stationUuid) => {
    // Build preset ui states for the layer and sublayers
    const stationCircleUIStates: CircleUIStates = {};
    if (missionCircleDefinitions) {
      Object.entries(missionCircleDefinitions || {})?.forEach(([uuid]) => {
        stationCircleUIStates[uuid] = { slidersSelected: false };
      });
    }
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
    clientLogger.error(
      { logId: "populateStore", logValue: "Error parsing folder interfaces from cookie" },
      error instanceof Error ? error : new Error(String(error))
    );
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

const generateEvaDropdownUIStates = (params: {
  wholeStoreState: WholeStoreState;
  mission: Mission;
}): void => {
  const { wholeStoreState, mission } = params;
  // Get list of all as-planned evas
  const allEvas = Object.values(mission?.evas ?? {});
  const allRexes = Object.values(mission?.rexes ?? {});
  const rexEvas = allRexes.map((rex) => rex.evaUuid);
  const asPlannedEvas = allEvas.filter((e) => !rexEvas.includes(e.uuid));
  for (const eva of asPlannedEvas) {
    wholeStoreState.eva.evaDropdownUIStates[eva.uuid] = eva.uuid;
  }
};
