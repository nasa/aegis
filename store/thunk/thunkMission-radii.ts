import appCreateAsyncThunk from "./thunkUtil";
import { setMission } from "store/mission";
import { v4 as uuidv4 } from "uuid";

export const thunkUpdateLanderRadius = appCreateAsyncThunk<{ landerRadius: LanderRadius }>(
  "updateLanderRadius",
  async ({ landerRadius }, { dispatch, getState }) => {
    const itemIndex = getState().mission.mission.landerRadii?.findIndex(
      (item) => item.uuid === landerRadius.uuid
    );
    const newLanderRadii = [...getState().mission.mission.landerRadii];
    newLanderRadii[itemIndex] = landerRadius;
    dispatch(setMission({ ...getState().mission.mission, landerRadii: newLanderRadii }));
  }
);

export const thunkDeleteLanderRadius = appCreateAsyncThunk<{ landerRadiusUuid: string }>(
  "deleteLanderRadius",
  async ({ landerRadiusUuid }, { dispatch, getState }) => {
    const newRadii = getState().mission.mission.landerRadii?.filter(
      (item) => item.uuid !== landerRadiusUuid
    );
    dispatch(setMission({ ...getState().mission.mission, landerRadii: newRadii }));
  }
);

export const thunkCreateLanderRadius = appCreateAsyncThunk<void>(
  "createLanderRadius",
  async (_, { dispatch, getState }) => {
    const blankLanderRadius: LanderRadius = {
      uuid: uuidv4(),
      name: "(Lander Radius Name)",
      radius: 0,
    };

    const landerRadii = getState().mission.mission.landerRadii || [];
    const landerRadius = blankLanderRadius;
    const newLanderRadii = [...landerRadii, landerRadius];
    dispatch(setMission({ ...getState().mission.mission, landerRadii: newLanderRadii }));
  }
);
