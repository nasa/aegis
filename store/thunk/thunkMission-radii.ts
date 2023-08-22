import { cloneDeep } from "lodash";
import appCreateAsyncThunk from "./thunkUtil";
import { upsertMission, upsertMissionByField } from "store/mission";
import { v4 as uuidv4 } from "uuid";

export const thunkUpdateLanderRadius = appCreateAsyncThunk<{
  uuid: string;
  fieldName: keyof LanderRadius;
  value: LanderRadius[keyof LanderRadius];
}>("updateLanderRadius", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const newLanderRadii = cloneDeep(getState().mission.mission.landerRadii);
  const itemIndex = newLanderRadii?.findIndex((item) => item.uuid === uuid);
  if (itemIndex >= 0) {
    (newLanderRadii[itemIndex] as Record<typeof fieldName, LanderRadius[keyof LanderRadius]>)[
      fieldName
    ] = value;
    dispatch(upsertMissionByField("landerRadii", newLanderRadii));
  }
});

export const thunkDeleteLanderRadius = appCreateAsyncThunk<{ landerRadiusUuid: string }>(
  "deleteLanderRadius",
  async ({ landerRadiusUuid }, { dispatch, getState }) => {
    const newRadii = getState().mission.mission.landerRadii?.filter(
      (item) => item.uuid !== landerRadiusUuid
    );
    dispatch(upsertMission({ ...getState().mission.mission, landerRadii: newRadii }));
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
    dispatch(upsertMission({ ...getState().mission.mission, landerRadii: newLanderRadii }));
  }
);
