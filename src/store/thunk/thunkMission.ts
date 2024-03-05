import appCreateAsyncThunk from "./thunkUtil";
import * as httpClient_mission from "http-client/mission";
import { cloneDeep, sortBy } from "lodash";
import {
  upsertMission,
  setMissionFromDb,
  setMissionSectionEditing,
  upsertMissionByField,
} from "store/mission";
import { thunkGetElevation } from "./thunkElevation";
import { thunkFullUpdateWalkback, thunkSaveStation } from "./thunkStation";
import { setPresetUIStates } from "store/preset";
import { thunkSavePreset } from "./thunkPreset";
import { setMapCircleControls } from "store/map";
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

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const mission = getState().mission.mission;
    const isRexRunning: boolean = getState().rex.rexes.find((rex) => rex.isRunning)?.isRunning;

    //Alphabetize the items by name
    const sortedEquipmentItems = sortBy(mission.equipmentItems, "name");
    const sortedGeoUnits = sortBy(mission.geographicUnits, "name");
    const sortedLanderRadii = sortBy(mission.landerRadii, "radius");
    const sortedTemplates = sortBy(mission.actionTemplates, ["type", "templateName"]);

    //save mission to db
    const upsertResponse = await httpClient_mission.upsertMissions(
      [
        {
          ...mission,
          equipmentItems: sortedEquipmentItems,
          geographicUnits: sortedGeoUnits,
          landerRadii: sortedLanderRadii,
          actionTemplates: sortedTemplates,
          updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
        },
      ],
      isRexRunning
    );

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
      const oldPresetUIStates: PresetUIStates = getState().preset.presetsUIStates[preset.uuid];
      const newPresetUIState: PresetUIStates = { ...oldPresetUIStates };
      const newMapCircleControls: MapCircleControls = {};

      sortedLanderRadii.forEach((landerRadius) => {
        //update ui states
        if (oldPresetUIStates[landerRadius.uuid]) {
          newPresetUIState[landerRadius.uuid] = oldPresetUIStates[landerRadius.uuid];
        } else {
          newPresetUIState[landerRadius.uuid] = {
            expanded: true,
            tabSelected: null,
            name: landerRadius.name,
            type: "circle",
          };
        }
        //remove any radii that were deleted
        for (const uuid of Object.keys(newPresetUIState)) {
          const isSublayer = getState().mission.sublayers?.some(
            (sublayer) => sublayer.uuid === uuid
          );
          const isHeaderLayer = getState().mission.layers?.some((layer) => layer.uuid === uuid);
          const isCircle = sortedLanderRadii.some((landerRadius) => landerRadius.uuid === uuid);

          if (!isSublayer && !isHeaderLayer && !isCircle) delete newPresetUIState[uuid];
        }

        //update map circle controls
        if (preset.mapCircleControls[landerRadius.uuid]) {
          newMapCircleControls[landerRadius.uuid] = preset.mapCircleControls[landerRadius.uuid];
        } else {
          newMapCircleControls[landerRadius.uuid] = {
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
        }
      });

      dispatch(
        setPresetUIStates({
          presetUuid: preset.uuid,
          presetUIStates: newPresetUIState,
        })
      );
      newPreset.mapCircleControls = newMapCircleControls;
      dispatch(setMapCircleControls(newMapCircleControls));
      dispatch(thunkSavePreset({ preset: newPreset }));
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

    const templateUuid = uuidv4();

    const blankActionTemplate: ActionTemplate = {
      templateName: randomName,
      missionId: getState().mission.mission?.id,
      uuid: templateUuid,
      name: "",
      description: "",
      status: "Candidate",
      type: "other",
      durationLower: 5,
      durationUpper: 6,
      stmUuidRefs: null,
      equipmentItemsUsage: null,
      geographicUnitsUsage: null,
      crewAssigned: [],
      mass: null,
      priority: null,
      createdAt: roundDateToSecond(getAccurateNow()).toISOString(),
      updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
    };

    //upsert action template
    const actionTemplates = cloneDeep(getState().mission.mission.actionTemplates) || [];
    actionTemplates.push(blankActionTemplate);
    dispatch(upsertMissionByField("actionTemplates", actionTemplates));

    return templateUuid;
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
      stmStore: getState().stm,
      mission: getState().mission?.mission,
    });

    /**
     * POIs
     */
    const pois: ExportPOI[] = makeExportPois({
      poiStore: getState().poi,
      actions,
      missionStore: getState().mission,
    });

    /**
     * Stations
     */
    const stations: ExportStation[] = makeExportStations({
      stationStore: getState().station,
      actions,
      missionStore: getState().mission,
      pois,
    });

    /**
     * Traverses
     */
    const traverses: ExportTraverse[] = makeExportTraverses({
      traverses: getState().traverse?.traverses,
      calculatedFields: getState().traverse?.calculatedFields,
    });

    /**
     * EVAs
     */
    const evas: ExportEva[] = makeExportEvas({
      evas: getState().eva?.evas,
      evaCalculatedFields: getState().eva?.calculatedFields,
      stations,
      traverses,
      missionStore: getState().mission,
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
