import appCreateAsyncThunk from "./thunkUtil";
import * as InternalAPI from "http-client/mission";
import { sortBy } from "lodash";

import { setMission, setMissionFromDb, setMissionSectionEditing } from "store/mission";
import { thunkGetElevation } from "./thunkElevation";
import { thunkFullUpdateWalkback, thunkSaveStation } from "./thunkStation";

export const thunkMissionSave = appCreateAsyncThunk<void>(
  "missionSave",
  async (_, { dispatch, getState }) => {
    const mission = getState().mission.mission;

    //Alphabetize the equipmentItems by name
    const sortedEquipmentItems = sortBy(mission.equipmentItems, "name");
    const sortedGeoUnits = sortBy(mission.geographicUnits, "name");

    //save mission to db
    const upsertResponse = await InternalAPI.upsertMission({
      ...mission,
      equipmentItems: sortedEquipmentItems,
      geographicUnits: sortedGeoUnits,
    });

    if (upsertResponse.status === "success") {
      // update the db copy in the store
      const mission = upsertResponse.data;
      dispatch(setMissionFromDb(mission));
      dispatch(setMission(mission));
    } else {
      throw new Error("Error saving mission: " + upsertResponse.message);
    }

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
