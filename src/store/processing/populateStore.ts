import { initialState as wholeStoreInitialState } from "store/index";
import { getAll } from "http-client/all";
import cloneDeep from "lodash/cloneDeep";
import Cookies from "js-cookie";
import {
  auditActionDefinitions,
  auditActions,
  auditMissionGrid,
  auditTraverseTerrainProfiles,
} from "./audits";
import { getAutomergeDocListing } from "http-client/docListing";
import type { DocHandle, Repo, AutomergeUrl } from "@automerge/automerge-repo";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import { setMissionAutomergeDocHandle } from "client/automergeDocHandles";
import { validateMission } from "utils/validateSchemaClient";
import { clientLogger } from "utils/logging/clientLogger";
import {
  buildPresetCircleUIStates,
  buildPresetLayerUIStates,
  getMissionDefaultPresetUuid,
} from "store/thunk/thunkPreset";

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

  // Get automerge URL and mission doc handle
  const amDocListing = (await getAutomergeDocListing(missionId, loadTestOptions)).data[0];
  if (!isValidAutomergeUrl(amDocListing?.automergeUrl)) {
    throw new Error("Invalid Automerge URL");
  }
  wholeStoreState.mission.automergeUrl = amDocListing?.automergeUrl; // put url in the store
  const missionDocHandle: DocHandle<Mission> = await automergeRepo.find(
    amDocListing.automergeUrl as AutomergeUrl
  );
  if (!missionDocHandle) {
    throw new Error("Mission doc handle not found in repo");
  }
  await missionDocHandle.whenReady();
  setMissionAutomergeDocHandle(missionDocHandle); // Save doc handle to client global for future access

  // Get circle definitions from the mission automerge doc
  const mission = missionDocHandle.doc();
  const missionCircleDefinitions = mission.circleDefinitions;

  // Generate folders interface states for the store (using cookies if available)
  generateFoldersInterfaceStates({ wholeStoreState, mission });

  // Run audits on the data returned, modifying the data as needed. Each audit function will save needed changes
  // Require the automerge doc handle is ready since these audits need access to and update mission
  if (runAudit) {
    await auditActionDefinitions({ missionDocHandle });
    await auditActions({ missionDocHandle });
    await auditMissionGrid({ missionDocHandle });
    await auditTraverseTerrainProfiles({ missionDocHandle });
  }

  // Set the default preset
  wholeStoreState.preset.selectedPresetUuid = getMissionDefaultPresetUuid(mission);

  // Generate preset layers and circles UI states for the store (not in the doc)
  for (const presetUuid of Object.keys(mission.presets ?? {})) {
    wholeStoreState.preset.presetLayersUIStates[presetUuid] = buildPresetLayerUIStates(mission);
    wholeStoreState.preset.presetCirclesUIStates[presetUuid] = buildPresetCircleUIStates(mission);
  }

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

const generateFoldersInterfaceStates = (params: {
  wholeStoreState: WholeStoreState;
  mission: Mission;
}): void => {
  const { wholeStoreState, mission } = params;
  let foldersInterfaceCookie: FoldersInterfaceState = {};
  try {
    foldersInterfaceCookie = JSON.parse(Cookies.get("AEGIS_Folders_Interface") || "{}");
  } catch (error) {
    clientLogger.error(
      {
        logId: "populateStore:foldersInterface:failedToParseFoldersInterfaceCookie",
        logValue: "Error parsing folder interfaces from cookie",
      },
      error instanceof Error ? error : new Error(String(error))
    );
  }
  for (const folder of Object.values(mission?.folders ?? {})) {
    const savedState = foldersInterfaceCookie[folder.uuid];
    wholeStoreState.interface.foldersInterface[folder.uuid] = {
      uuid: folder.uuid,
      isOpen: savedState?.isOpen ?? true,
      editing: false,
      editingNameValue: null,
    };
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
