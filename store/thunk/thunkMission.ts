import appCreateAsyncThunk from "./thunkUtil";
import * as InternalAPI from "http-client/mission";
import { sortBy } from "lodash";
import { v4 as uuidv4 } from "uuid";

import { setMission, setMissionFromDb, setMissionSectionEditing } from "store/mission";
import { thunkGetElevation } from "./thunkElevation";
import { thunkFullUpdateWalkback, thunkSaveStation } from "./thunkStation";
import { setPresetUIStates } from "store/preset";
import { thunkSavePreset } from "./thunkPreset";
import { setMapCircleControls } from "store/map";

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const mission = getState().mission.mission;

    //Alphabetize the equipmentItems by name
    const sortedEquipmentItems = sortBy(mission.equipmentItems, "name");
    const sortedGeoUnits = sortBy(mission.geographicUnits, "name");
    const sortedLanderRadii = sortBy(mission.landerRadii, "radius");

    //save mission to db
    const upsertResponse = await InternalAPI.upsertMission({
      ...mission,
      equipmentItems: sortedEquipmentItems,
      geographicUnits: sortedGeoUnits,
      landerRadii: sortedLanderRadii,
    });

    if (upsertResponse.status === "success") {
      // update the db copy in the store
      const mission = upsertResponse.data;
      dispatch(setMissionFromDb(mission));
      dispatch(setMission(mission));
    } else {
      throw new Error("Error saving mission: " + upsertResponse.message);
    }

    getState().preset.presets.forEach((preset) => {
      const newPreset: Preset = { ...preset };
      const presetUIStates: PresetUIStates = getState().preset.presetsUIStates[preset.uuid];
      const newPresetUIState: PresetUIStates = {};
      const updatedCircleControls: MapCircleControls = {};

      sortedLanderRadii.forEach((landerRadius) => {
        if (presetUIStates[landerRadius.uuid]) {
          newPresetUIState[landerRadius.uuid] = presetUIStates[landerRadius.uuid];
        } else {
          newPresetUIState[landerRadius.uuid] = {
            expanded: true,
            tabSelected: null,
          };
        }

        if (preset.mapCircleControls[landerRadius.uuid]) {
          updatedCircleControls[landerRadius.uuid] = preset.mapCircleControls[landerRadius.uuid];
        } else {
          updatedCircleControls[landerRadius.uuid] = {
            uuid: uuidv4(),
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

      newPreset.mapCircleControls = updatedCircleControls;

      dispatch(
        setPresetUIStates({
          presetUuid: preset.uuid,
          presetUIStates: newPresetUIState,
        })
      );
      dispatch(setMapCircleControls(updatedCircleControls));
      dispatch(thunkSavePreset({ preset: newPreset }));
    });

    dispatch(setMissionSectionEditing({ section: "prefs", editMode: false }));
  }
);

export const thunkMissionCancel = appCreateAsyncThunk<void>(
  "missionCancel",
  async (_, { dispatch, getState }) => {
    const missionFromDb = getState().mission.missionFromDb;
    dispatch(setMission(missionFromDb));
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
      setMission({
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
