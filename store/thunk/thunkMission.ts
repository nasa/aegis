import appCreateAsyncThunk from "./thunkUtil";
import * as InternalAPI from "http-client/mission";
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
import { generateUniqueName } from "utils/names/unique-name";
import { v4 as uuidv4 } from "uuid";

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const mission = getState().mission.mission;

    //rex active?
    const rexRunning: boolean = getState().rex.rexes.find((rex) => rex.rexRunning)?.rexRunning;

    //Alphabetize the items by name
    const sortedEquipmentItems = sortBy(mission.equipmentItems, "name");
    const sortedGeoUnits = sortBy(mission.geographicUnits, "name");
    const sortedLanderRadii = sortBy(mission.landerRadii, "radius");
    const sortedTemplates = sortBy(mission.actionTemplates, ["type", "templateName"]);

    //save mission to db
    const upsertResponse = await InternalAPI.upsertMission(
      {
        ...mission,
        equipmentItems: sortedEquipmentItems,
        geographicUnits: sortedGeoUnits,
        landerRadii: sortedLanderRadii,
        actionTemplates: sortedTemplates,
        updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
      },
      rexRunning
    );

    if (upsertResponse.status === "success") {
      // update the db copy in the store
      const mission = upsertResponse.data;
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
          const isSublayer = getState().mission.sublayers.some(
            (sublayer) => sublayer.uuid === uuid
          );
          const isHeaderLayer = getState().mission.layers.some((layer) => layer.uuid === uuid);
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
  const thunkResponse = await dispatch(
    thunkGetElevation({
      path: [location],
      pathSegmentDistances: [0],
      uuid: "lander",
    })
  );

  if (thunkResponse.payload === false) {
    //gracefully reject?
  } else {
    const elevation = thunkResponse.payload as number;
    //upsert lander location and elevation
    dispatch(
      upsertMission({
        ...getState().mission.mission,
        landerLocation: location,
        landerElevationMeters: elevation,
      })
    );
  }

  // loop through all stations and update their walkback traverses to snap to the new lander location
  for (const station of getState().station.stations) {
    const newPath = await dispatch(
      thunkFullUpdateWalkback({
        path: station.walkbackPath,
        stationUuid: station.uuid,
      })
    );

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

export const thunkCreateActionTemplate = appCreateAsyncThunk<void>(
  "createActionTemplate",
  async (_, { dispatch, getState }) => {
    const randomName = generateUniqueName({
      dictName: "animals",
      existingNames: getState().mission.mission.actionTemplates?.map((a) => a.type) || [],
    });

    const blankActionTemplate: ActionTemplate = {
      templateName: randomName,
      missionId: getState().mission.mission?.id,
      uuid: uuidv4(),
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
    dispatch(upsertMission({ ...getState().mission.mission, actionTemplates: actionTemplates }));
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

  dispatch(upsertMission({ ...getState().mission.mission, actionTemplates: newActionTemplates }));
});

export const thunkDeleteActionTemplate = appCreateAsyncThunk<{ actionTemplateUuid: string }>(
  "deleteActionTemplate",
  async ({ actionTemplateUuid }, { dispatch, getState }) => {
    const newActionTemplates = getState().mission.mission.actionTemplates?.filter(
      (item) => item.uuid !== actionTemplateUuid
    );
    dispatch(upsertMission({ ...getState().mission.mission, actionTemplates: newActionTemplates }));
  }
);
