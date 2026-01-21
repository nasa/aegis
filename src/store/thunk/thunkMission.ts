import appCreateAsyncThunk from "./thunkUtil";
import * as httpClient_mission from "http-client/mission";
import cloneDeep from "lodash/cloneDeep";
import {
  upsertMission,
  setMissionFromDb,
  setMissionSectionEditing,
  upsertMissionByField,
} from "store/mission";
import { thunkGetElevation } from "./thunkElevation";
import { thunkFullUpdateWalkback, thunkSaveStation } from "./thunkStation";
import { setPresetCircleUIStates, upsertPresetByField } from "store/preset";
import { thunkSavePreset } from "./thunkPreset";
import { getAccurateNow } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import {
  makeExportMission,
  makeExportActions,
  makeExportEvas,
  makeExportPois,
  makeExportRexes,
  makeExportStations,
  makeExportTraverses,
} from "utils/export";
import * as jsonKeysSort from "json-keys-sort";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { setStationCircleUIStates, upsertStationByField } from "store/station";
import { globalGrid } from "utils/mapping/grid";
import isEqual from "lodash/isEqual";
import { thunkFullUpdateTraverse } from "./thunkTraverse";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const newMission = getState().mission.mission;
    const oldMission = getState().mission.missionFromDb;

    //save mission to db
    const upsertResponse = await httpClient_mission.upsertMissions([
      {
        ...newMission,
        updatedAt: getAccurateNow().toISOString(),
      },
    ]);

    if (upsertResponse.status === "success") {
      // update the db copy in the store
      const mission = upsertResponse.data[0];
      dispatch(upsertMission(mission, true));
      dispatch(setMissionFromDb(mission));
    } else {
      throw new Error("Error saving mission: " + upsertResponse.message);
    }

    //sync up presets circle layers
    if (!isEqual(newMission.circleDefinitions, oldMission.circleDefinitions)) {
      const savePresetPromises = getState().preset.presets.map((preset) => {
        const oldPresetCircleUIStates: CircleUIStates =
          getState().preset.presetCirclesUIStates[preset.uuid];

        const newPresetCircleUIStates: CircleUIStates = { ...oldPresetCircleUIStates };
        const newMapCircleControls: MapCircleControls = {};

        Object.entries(newMission.circleDefinitions).forEach(([circleUuid, circleDefinition]) => {
          //update ui states
          if (oldPresetCircleUIStates[circleUuid]) {
            newPresetCircleUIStates[circleUuid] = oldPresetCircleUIStates[circleUuid];
          } else {
            newPresetCircleUIStates[circleUuid] = {
              name: circleDefinition.name,
              slidersSelected: false,
            };
          }
          //remove any UI states circle definitions that were deleted
          for (const uuid of Object.keys(newPresetCircleUIStates)) {
            const isSublayer = getState().mission.sublayers?.some(
              (sublayer) => sublayer.uuid === uuid
            );
            const isHeaderLayer = getState().mission.layers?.some((layer) => layer.uuid === uuid);
            const isCircle = !!newMission.circleDefinitions[uuid];

            if (!isSublayer && !isHeaderLayer && !isCircle) delete newPresetCircleUIStates[uuid];
          }

          //update preset map circle controls
          if (preset.mapCircleControls[circleUuid]) {
            newMapCircleControls[circleUuid] = preset.mapCircleControls[circleUuid];
          } else {
            newMapCircleControls[circleUuid] = {
              name: circleDefinition.name,
              uuid: circleUuid,
              visible: false,
              style: defaultSublayerStyle,
            };
          }
        });

        dispatch(
          setPresetCircleUIStates({
            presetUuid: preset.uuid,
            circleUIStates: newPresetCircleUIStates,
          })
        );
        dispatch(upsertPresetByField(preset.uuid, "mapCircleControls", newMapCircleControls));
        return dispatch(thunkSavePreset({ presetUuid: preset.uuid }));
      });
      // wait for all station saves to be completed
      await Promise.all(savePresetPromises);

      //sync up stations circle controls
      const saveStationPromises = getState().station.stations.map((station) => {
        const oldStationCircleUIStates = getState().station.stationCirclesUIStates[station.uuid];

        const newStationCircleUIStates: CircleUIStates = { ...oldStationCircleUIStates };
        const newMapCircleControls: MapCircleControls = {};

        Object.entries(newMission.circleDefinitions).forEach(([circleUuid, circleDefinition]) => {
          //update ui states
          if (oldStationCircleUIStates[circleUuid]) {
            newStationCircleUIStates[circleUuid] = oldStationCircleUIStates[circleUuid];
          } else {
            newStationCircleUIStates[circleUuid] = {
              name: circleDefinition.name,
              slidersSelected: false,
            };
          }
          //remove any UI states circle definitions that were deleted
          for (const uuid of Object.keys(newStationCircleUIStates)) {
            const isCircle = !!newMission.circleDefinitions[uuid];
            if (!isCircle) delete newStationCircleUIStates[uuid];
          }

          //update station map circle controls
          if (station.mapCircleControls[circleUuid]) {
            newMapCircleControls[circleUuid] = station.mapCircleControls[circleUuid];
          } else {
            newMapCircleControls[circleUuid] = {
              name: circleDefinition.name,
              uuid: circleUuid,
              visible: false,
              style: defaultSublayerStyle,
            };
          }
        });

        dispatch(
          setStationCircleUIStates({
            stationUuid: station.uuid,
            circleUIStates: newStationCircleUIStates,
          })
        );
        dispatch(upsertStationByField(station.uuid, "mapCircleControls", newMapCircleControls));
        return dispatch(thunkSaveStation({ stationUuid: station.uuid }));
      });
      // wait for all station saves to be completed
      await Promise.all(saveStationPromises);
    }

    dispatch(setMissionSectionEditing({ section: "prefs", editMode: false }));
  }
);

export const thunkMissionCancel = appCreateAsyncThunk<void>(
  "missionCancel",
  async (_, { dispatch, getState }) => {
    const oldMission = getState().mission.mission;
    const missionFromDb = getState().mission.missionFromDb;

    // check if the lander location was modified. If so, we need to reset all stations and evas
    if (!isEqual(oldMission.landerLocation, missionFromDb.landerLocation)) {
      await dispatch(thunkUpdateLanderLocation({ location: missionFromDb.landerLocation }));
    }

    // reset mission to the copy from db
    dispatch(upsertMission(missionFromDb, true));
    dispatch(setMissionSectionEditing({ section: "prefs", editMode: false }));
  }
);

export const thunkUpdateLanderLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
}>("updateLanderLocation", async ({ location }, { dispatch, getState }) => {
  dispatch(upsertMissionByField("landerLocation", location));

  const thunkElevationRes = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: "lander",
    })
  );

  if (thunkElevationRes.meta.requestStatus !== "rejected") {
    //upsert lander location and elevation
    const elevation = thunkElevationRes.payload as number;
    dispatch(upsertMissionByField("landerElevationMeters", elevation));
  }

  // Loop through all stations and update their walkback traverses to snap to the new lander location
  // This automatically saves, there's no "draft" for these changes
  // Create an array of promises for all station updates
  const stationUpdatePromises = getState().station.stations.map(async (station) => {
    const newPathRes = await dispatch(
      thunkFullUpdateWalkback({
        path: station.walkbackPath,
        stationUuid: station.uuid,
      })
    );

    if (newPathRes.meta.requestStatus === "rejected" || !newPathRes.payload) {
      throw new Error("Error updating lander location in thunkUpdateLanderLocation");
    }

    dispatch(upsertStationByField(station.uuid, "walkbackPath", newPathRes.payload));
    // Return the dispatch promise but don't await it here
    return dispatch(thunkSaveStation({ stationUuid: station.uuid }));
  });
  await Promise.all(stationUpdatePromises); // Wait for all station updates to complete

  // Loop through evas that have lander as their egress location as lander and update their traverses
  // This automatically saves, there's no "draft" for these changes
  const egressEvas = getState().eva.evas.filter(
    (e) => e.egressLocationUuid === "lander" && e.sequence.length > 0
  );
  const traverseUpdateEgressPromises = egressEvas.map((eva) => {
    return dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: eva.sequence[0].uuid,
        rename: false,
        evaSequence: eva.sequence,
        saveToDb: true,
      })
    );
  });
  await Promise.all(traverseUpdateEgressPromises);

  // Loop through evas that have lander as their ingress location and update their traverses
  // This automatically saves, there's no "draft" for these changes
  const ingressEvas = getState().eva.evas.filter(
    (e) => e.ingressLocationUuid === "lander" && e.sequence.length > 0
  );
  const traverseUpdateIngressPromises = ingressEvas.map((eva) => {
    return dispatch(
      thunkFullUpdateTraverse({
        traverseUuid: eva.sequence[eva.sequence.length - 1].uuid,
        rename: false,
        evaSequence: eva.sequence,
        saveToDb: true,
      })
    );
  });
  await Promise.all(traverseUpdateIngressPromises);
});

export const thunkCreateActionTemplate = appCreateAsyncThunk<void, string>(
  "createActionTemplate",
  async (_, { dispatch, getState }) => {
    const missionActionTemplates = getState().mission.mission.actionTemplates;
    const existingNames = Object.entries(missionActionTemplates).map(([_, at]) => at.templateName);
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames,
    });

    const blankActionTemplate: ActionTemplate = generateBlankActionTemplate({
      templateName: randomName,
    });

    //upsert action template
    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || {};
    const newUuid = uuidv4();
    actionTemplates[newUuid] = blankActionTemplate;
    dispatch(upsertMissionByField("actionTemplates", actionTemplates));

    return newUuid;
  }
);

export const thunkCreateTemplateFromAction = appCreateAsyncThunk<{ actionUuid: string }, string>(
  "createTemplateFromAction",
  async ({ actionUuid }, { dispatch, getState }) => {
    const action = getState().action.actions.find((a) => a.uuid === actionUuid);

    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || {};

    const newActionTemplate: ActionTemplate = {
      templateName: `Template of ${action.name}`,
      name: action.name,
      actionDefinition: action.actionDefinition,
      icon: action.icon,
      description: action.description,
      descriptionTask: action.descriptionTask,
      status: action.status,
      type: action.type,
      duration: action.duration,
      stmAction: action.stmAction,
      stmPriorities: action.stmPriorities,
      equipmentItemsUsage: action.equipmentItemsUsage,
      geographicUnitsUsage: action.geographicUnitsUsage,
      crewAssigned: action.crewAssigned,
      mass: action.mass,
      priority: action.priority,
      createdAt: getAccurateNow().toISOString(),
      updatedAt: getAccurateNow().toISOString(),
    };

    //upsert action template
    const newUuid = uuidv4();
    actionTemplates[newUuid] = newActionTemplate;

    dispatch(upsertMissionByField("actionTemplates", actionTemplates));
    dispatch(thunkMissionSave());
    return newUuid;
  }
);

export const thunkUpdateActionTemplate = appCreateAsyncThunk<{
  uuid: string;
  fieldName: keyof ActionTemplate;
  value: ActionTemplate[keyof ActionTemplate];
}>("updateActionTemplate", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const newActionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || {};
  if (newActionTemplates[uuid]) {
    newActionTemplates[uuid].updatedAt = getAccurateNow().toISOString();
    (newActionTemplates[uuid] as Record<string, unknown>)[fieldName] = value;
    dispatch(upsertMissionByField("actionTemplates", newActionTemplates));
  }
});

export const thunkDeleteActionTemplate = appCreateAsyncThunk<{ actionTemplateUuid: string }>(
  "deleteActionTemplate",
  async ({ actionTemplateUuid }, { dispatch, getState }) => {
    const newActionTemplates = cloneDeep(getState().mission.mission.actionTemplates);
    delete newActionTemplates[actionTemplateUuid];
    dispatch(upsertMissionByField("actionTemplates", newActionTemplates));
  }
);

export const thunkDuplicateActionTemplate = appCreateAsyncThunk<{ actionTemplateUuid: string }>(
  "duplicateActionTemplate",
  async ({ actionTemplateUuid }, { dispatch, getState }) => {
    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || {};
    const modelTemplate = actionTemplates[actionTemplateUuid];
    if (!modelTemplate) return;

    const duplicatedActionTemplate: ActionTemplate = cloneDeep(modelTemplate);
    duplicatedActionTemplate.createdAt = getAccurateNow().toISOString();
    duplicatedActionTemplate.updatedAt = getAccurateNow().toISOString();
    duplicatedActionTemplate.templateName = makeUniqueStringCopy(
      modelTemplate.templateName,
      Object.entries(actionTemplates).map(([_, at]) => at.templateName)
    );

    //upsert action template
    actionTemplates[uuidv4()] = duplicatedActionTemplate;
    dispatch(upsertMissionByField("actionTemplates", actionTemplates));
  }
);

export const thunkMakeExportString = appCreateAsyncThunk<
  {
    selectEvas: boolean;
    selectMission: boolean;
    selectPois: boolean;
    selectStations: boolean;
    selectActions: boolean;
    selectTraverses: boolean;
    selectRexes: boolean;
  },
  string,
  false
>(
  "makeExportString",
  async (
    {
      selectEvas,
      selectMission,
      selectPois,
      selectStations,
      selectActions,
      selectTraverses,
      selectRexes,
    },
    { getState }
  ) => {
    const allData: AllDataForExport = {
      mission: getState().mission.mission,
      pois: getState().poi.pois,
      stations: getState().station.stations,
      actions: getState().action.actions,
      traverses: getState().traverse.traverses,
      evas: getState().eva.evas,
      rexes: getState().rex.rexes,
      level1s: getState().stm.level1s,
      level2s: getState().stm.level2s,
      level3s: getState().stm.level3s,
    };
    let selectedExportedData = {};

    /**
     * Mission
     */
    if (selectMission) {
      const mission = makeExportMission({
        mission: getState().mission.mission,
        missionGrid: globalGrid?.coordinates,
      });
      selectedExportedData = { ...selectedExportedData, mission };
    }
    /**
     * Actions
     */
    if (selectActions) {
      const actions: ExportAction[] = makeExportActions({
        actions: getState().action?.actions,
        allData,
        missionGrid: globalGrid?.coordinates,
      });
      selectedExportedData = { ...selectedExportedData, actions };
    }
    /**
     * POIs
     */
    if (selectPois) {
      const pois: ExportPOI[] = makeExportPois({
        pois: getState().poi.pois,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, pois };
    }
    /**
     * Stations
     */
    if (selectStations) {
      const stations: ExportStation[] = makeExportStations({
        stations: getState().station.stations,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, stations };
    }
    /**
     * Traverses
     */
    if (selectTraverses) {
      const traverses: ExportTraverse[] = makeExportTraverses({
        traverses: getState().traverse?.traverses,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, traverses };
    }
    /**
     * EVAs
     */
    if (selectEvas) {
      const evas: ExportEva[] = makeExportEvas({
        evas: getState().eva?.evas,
        missionGrid: globalGrid?.coordinates,
        allData,
      });
      selectedExportedData = { ...selectedExportedData, evas };
    }
    /**
     * REXes
     */
    if (selectRexes) {
      const rexes: ExportRex[] = makeExportRexes({
        rexes: getState().rex?.rexes,
      });
      selectedExportedData = { ...selectedExportedData, rexes };
    }

    // convert object to readable string
    const sortedJson = jsonKeysSort.sort(selectedExportedData);
    const dataStr = JSON.stringify(sortedJson, null, 2);

    return dataStr;
  }
);
