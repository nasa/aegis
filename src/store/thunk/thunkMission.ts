import appCreateAsyncThunk from "./thunkUtil";
import * as httpClient_mission from "http-client/mission";
import sortBy from "lodash/sortBy";
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
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
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
import { globalGrid } from "utils/grid";
import isEqual from "lodash/isEqual";
import { thunkFullUpdateTraverse } from "./thunkTraverse";

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const newMission = getState().mission.mission;
    const oldMission = getState().mission.missionFromDb;

    //Alphabetize the items by name
    const sortedEquipmentItems = sortBy(newMission.equipmentItems, [
      (item) => item.name.toLowerCase(),
    ]);
    const sortedGeoUnits = sortBy(newMission.geographicUnits, [(unit) => unit.name.toLowerCase()]);
    const sortedCircleDefinitions = sortBy(newMission.circleDefinitions, [
      "radius",
      (radius) => radius.name.toLowerCase(),
    ]);
    const sortedTemplates = sortBy(newMission.actionTemplates, [
      "type",
      (template) => template.templateName.toLowerCase(),
    ]);

    //save mission to db
    const upsertResponse = await httpClient_mission.upsertMissions([
      {
        ...newMission,
        equipmentItems: sortedEquipmentItems,
        geographicUnits: sortedGeoUnits,
        circleDefinitions: sortedCircleDefinitions,
        actionTemplates: sortedTemplates,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
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

        sortedCircleDefinitions?.forEach((circleDefinition) => {
          //update ui states
          if (oldPresetCircleUIStates[circleDefinition.uuid]) {
            newPresetCircleUIStates[circleDefinition.uuid] =
              oldPresetCircleUIStates[circleDefinition.uuid];
          } else {
            newPresetCircleUIStates[circleDefinition.uuid] = {
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
            const isCircle = sortedCircleDefinitions.some(
              (circleDefinition) => circleDefinition.uuid === uuid
            );

            if (!isSublayer && !isHeaderLayer && !isCircle) delete newPresetCircleUIStates[uuid];
          }

          //update preset map circle controls
          if (preset.mapCircleControls[circleDefinition.uuid]) {
            newMapCircleControls[circleDefinition.uuid] =
              preset.mapCircleControls[circleDefinition.uuid];
          } else {
            newMapCircleControls[circleDefinition.uuid] = {
              name: circleDefinition.name,
              uuid: circleDefinition.uuid,
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

        sortedCircleDefinitions?.forEach((circleDefinition) => {
          //update ui states
          if (oldStationCircleUIStates[circleDefinition.uuid]) {
            newStationCircleUIStates[circleDefinition.uuid] =
              oldStationCircleUIStates[circleDefinition.uuid];
          } else {
            newStationCircleUIStates[circleDefinition.uuid] = {
              name: circleDefinition.name,
              slidersSelected: false,
            };
          }
          //remove any UI states circle definitions that were deleted
          for (const uuid of Object.keys(newStationCircleUIStates)) {
            const isCircle = sortedCircleDefinitions.some(
              (circleDefinition) => circleDefinition.uuid === uuid
            );
            if (!isCircle) delete newStationCircleUIStates[uuid];
          }

          //update station map circle controls
          if (station.mapCircleControls[circleDefinition.uuid]) {
            newMapCircleControls[circleDefinition.uuid] =
              station.mapCircleControls[circleDefinition.uuid];
          } else {
            newMapCircleControls[circleDefinition.uuid] = {
              name: circleDefinition.name,
              uuid: circleDefinition.uuid,
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

  if (!thunkElevationRes || thunkElevationRes.payload === false) {
    //gracefully reject?
  } else {
    const elevation = thunkElevationRes.payload as number;
    //upsert lander location and elevation
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
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: getState().mission.mission.actionTemplates?.map((a) => a.type) || [],
    });

    const blankActionTemplate: ActionTemplate = generateBlankActionTemplate({
      templateName: randomName,
      missionId: getState().mission.mission?.id,
    });

    //upsert action template
    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || [];
    actionTemplates.push(blankActionTemplate);
    dispatch(upsertMissionByField("actionTemplates", actionTemplates));

    return blankActionTemplate.uuid;
  }
);

export const thunkCreateTemplateFromAction = appCreateAsyncThunk<{ actionUuid: string }, string>(
  "createTemplateFromAction",
  async ({ actionUuid }, { dispatch, getState }) => {
    const action = getState().action.actions.find((a) => a.uuid === actionUuid);

    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || [];

    const newActionTemplate: ActionTemplate = {
      uuid: uuidv4(),
      missionId: action.missionId,
      templateName: `Template of ${action.name}`,
      type: action.type,
      name: action.name,
      actionDefinition: action.actionDefinition,
      description: action.description,
      duration: action.duration,
      mass: action.mass,
      icon: action.icon,
      equipmentItemsUsage: action.equipmentItemsUsage,
      geographicUnitsUsage: action.geographicUnitsUsage,
      stmAction: action.stmAction,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };

    //upsert action template
    actionTemplates.push(newActionTemplate);

    dispatch(upsertMissionByField("actionTemplates", actionTemplates));
    dispatch(thunkMissionSave());
    return newActionTemplate.uuid;
  }
);

export const thunkUpdateActionTemplate = appCreateAsyncThunk<{
  uuid: string;
  fieldName: keyof ActionTemplate;
  value: ActionTemplate[keyof ActionTemplate];
}>("updateActionTemplate", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const newActionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || [];
  const itemIndex = newActionTemplates.findIndex((t) => t.uuid === uuid);
  if (itemIndex >= 0) {
    newActionTemplates[itemIndex].updatedAt = roundDateToSecond(getAccurateNow()).toISOString();
    (
      newActionTemplates[itemIndex] as Record<
        typeof fieldName,
        ActionTemplate[keyof ActionTemplate]
      >
    )[fieldName] = value;
    dispatch(upsertMissionByField("actionTemplates", newActionTemplates));
  }
});

export const thunkDeleteActionTemplate = appCreateAsyncThunk<{ actionTemplateUuid: string }>(
  "deleteActionTemplate",
  async ({ actionTemplateUuid }, { dispatch, getState }) => {
    const newActionTemplates = getState().mission.mission.actionTemplates?.filter(
      (item) => item.uuid !== actionTemplateUuid
    );
    dispatch(upsertMissionByField("actionTemplates", newActionTemplates));
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

    // convert object to readble string
    const sortedJson = jsonKeysSort.sort(selectedExportedData);
    const dataStr = JSON.stringify(sortedJson, null, 2);

    return dataStr;
  }
);

export const thunkDuplicateActionTemplate = appCreateAsyncThunk<{ actionTemplateUuid: string }>(
  "duplicateActionTemplate",
  async ({ actionTemplateUuid }, { dispatch, getState }) => {
    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || [];
    const itemIndex = actionTemplates.findIndex((t) => t.uuid === actionTemplateUuid);
    const modelTemplate = actionTemplates[itemIndex];

    const duplicatedActionTemplate: ActionTemplate = cloneDeep(modelTemplate);
    duplicatedActionTemplate.uuid = uuidv4();
    duplicatedActionTemplate.createdAt = roundDateToSecond(getAccurateNow()).toISOString();
    duplicatedActionTemplate.updatedAt = roundDateToSecond(getAccurateNow()).toISOString();
    duplicatedActionTemplate.templateName = makeUniqueStringCopy(
      modelTemplate.templateName,
      actionTemplates.map((a) => a.templateName)
    );

    //upsert action template
    actionTemplates.push(duplicatedActionTemplate);
    dispatch(upsertMissionByField("actionTemplates", actionTemplates));
  }
);
