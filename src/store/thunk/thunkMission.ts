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
import { setPresetCircleUIStates } from "store/preset";
import { thunkSavePreset } from "./thunkPreset";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { makeUniqueStringCopy } from "utils/names/duplicate";
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";
import {
  makeExportActions,
  makeExportEvas,
  makeExportPois,
  makeExportRexes,
  makeExportStations,
  makeExportTraverses,
} from "utils/export";
import * as jsonKeysSort from "json-keys-sort";
import {
  getCalculatedFieldsByEva,
  getCalculatedFieldsByPoi,
  getCalculatedFieldsByStation,
  getCalculatedFieldsByTraverse,
} from "store/processing/calculatedFields";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { setStationCircleUIStates } from "store/station";

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const mission = getState().mission.mission;

    //Alphabetize the items by name
    const sortedEquipmentItems = sortBy(mission.equipmentItems, [
      (item) => item.name.toLowerCase(),
    ]);
    const sortedGeoUnits = sortBy(mission.geographicUnits, [(unit) => unit.name.toLowerCase()]);
    const sortedCircleDefinitions = sortBy(mission.circleDefinitions, [
      "radius",
      (radius) => radius.name.toLowerCase(),
    ]);
    const sortedTemplates = sortBy(mission.actionTemplates, [
      "type",
      (template) => template.templateName.toLowerCase(),
    ]);

    //save mission to db
    const upsertResponse = await httpClient_mission.upsertMissions([
      {
        ...mission,
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
    getState().preset.presets.forEach((preset) => {
      const newPreset: Preset = { ...preset };
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
              color: "#D33115",
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
      newPreset.mapCircleControls = newMapCircleControls;
      dispatch(thunkSavePreset({ preset: newPreset }));
    });

    //sync up stations circle controls
    getState().station.stations.forEach((station) => {
      const newStation: Station = { ...station };
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
              color: "#D33115",
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
      newStation.mapCircleControls = newMapCircleControls;
      dispatch(thunkSaveStation({ station: newStation }));
    });

    dispatch(setMissionSectionEditing({ section: "prefs", editMode: false }));
  }
);

export const thunkMissionCancel = appCreateAsyncThunk<void>(
  "missionCancel",
  async (_, { dispatch, getState }) => {
    const missionFromDb = getState().mission.missionFromDb;
    dispatch(upsertMission(missionFromDb, true));
    dispatch(setMissionSectionEditing({ section: "prefs", editMode: false }));
  }
);

export const thunkUpdateLanderLocation = appCreateAsyncThunk<{
  location: AEGISPoint;
}>("updateLanderLocation", async ({ location }, { dispatch, getState }) => {
  dispatch(upsertMissionByField("landerLocation", location));

  const thunkResponse = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: "lander",
    })
  );

  if (!thunkResponse || thunkResponse.payload === false) {
    //gracefully reject?
  } else {
    const elevation = thunkResponse.payload as number;
    //upsert lander location and elevation
    dispatch(upsertMissionByField("landerElevationMeters", elevation));
  }

  // loop through all stations and update their walkback traverses to snap to the new lander location
  for (const station of getState().station.stations) {
    const newPath = await dispatch(
      thunkFullUpdateWalkback({
        path: station.walkbackPath,
        stationUuid: station.uuid,
      })
    );

    // evas are updated in thunkSaveStation when traverses to/from the station are updated
    if (newPath.payload !== false) {
      dispatch(
        thunkSaveStation({
          station: {
            ...station,
            walkbackPath: newPath.payload,
          },
        })
      );
    }
  }
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
      durationLower: action.durationLower,
      durationUpper: action.durationUpper,
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
    /**
     * Actions
     */
    const actions: ExportAction[] = makeExportActions({
      actions: getState().action?.actions,
      stations: getState().station?.stations,
      pois: getState().poi?.pois,
      level1s: getState().stm?.level1s,
      level2s: getState().stm?.level2s,
      level3s: getState().stm?.level3s,
      mission: getState().mission?.mission,
    });

    /**
     * POIs
     */
    const pois: ExportPOI[] = makeExportPois({
      pois: getState().poi.pois,
      poiCalculatedFields: getState().poi?.pois.map((poi) =>
        getCalculatedFieldsByPoi({
          poiUuid: poi.uuid,
          actions: getState().action.actions,
        })
      ),
      actions,
      mission: getState().mission.mission,
    });

    /**
     * Stations
     */
    const stations: ExportStation[] = makeExportStations({
      stations: getState().station.stations,
      stationCalculatedFields: getState().station?.stations.map((station) =>
        getCalculatedFieldsByStation({
          stationUuid: station.uuid,
          stations: getState().station.stations,
          mission: getState().mission.mission,
          actions: getState().action.actions,
        })
      ),
      actions: actions,
      mission: getState().mission.mission,
      pois: getState().poi.pois,
    });

    /**
     * Traverses
     */
    const traverses: ExportTraverse[] = makeExportTraverses({
      traverses: getState().traverse?.traverses,
      calculatedFields: getState().traverse?.traverses.map((traverse) =>
        getCalculatedFieldsByTraverse({
          traverseUuid: traverse.uuid,
          traverses: getState().traverse.traverses,
          mission: getState().mission.mission,
          evas: getState().eva.evas,
        })
      ),
    });

    /**
     * EVAs
     */
    const evas: ExportEva[] = makeExportEvas({
      evas: getState().eva?.evas,
      evaCalculatedFields: getState().eva?.evas.map((eva) =>
        getCalculatedFieldsByEva({
          evaUuid: eva.uuid,
          evas: getState().eva.evas,
          stations: getState().station.stations,
          mission: getState().mission.mission,
          actions: getState().action.actions,
          traverses: getState().traverse.traverses,
        })
      ),
      stations,
      traverses,
      mission: getState().mission.mission,
    });

    /**
     * REXes
     */
    const rexes: ExportRex[] = makeExportRexes({
      rexes: getState().rex?.rexes,
    });

    /**
     * Finish
     */
    const exportedData: ExportedData = {
      mission: getState().mission.mission,
      pois,
      stations,
      actions,
      traverses,
      evas,
      rexes,
    };

    let selectedExportedData = {};
    if (selectEvas)
      selectedExportedData = { ...selectedExportedData, evas: { ...exportedData.evas } };
    if (selectMission)
      selectedExportedData = { ...selectedExportedData, mission: { ...exportedData.mission } };
    if (selectPois)
      selectedExportedData = { ...selectedExportedData, pois: { ...exportedData.pois } };
    if (selectStations)
      selectedExportedData = { ...selectedExportedData, stations: { ...exportedData.stations } };
    if (selectActions)
      selectedExportedData = { ...selectedExportedData, actions: { ...exportedData.actions } };
    if (selectTraverses)
      selectedExportedData = { ...selectedExportedData, traverses: { ...exportedData.traverses } };
    if (selectRexes)
      selectedExportedData = { ...selectedExportedData, rexes: { ...exportedData.rexes } };

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
