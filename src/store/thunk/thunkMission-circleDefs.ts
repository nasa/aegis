import cloneDeep from "lodash/cloneDeep";
import appCreateAsyncThunk from "./thunkUtil";
import { upsertMission, upsertMissionByField } from "store/mission";
import { v4 as uuidv4 } from "uuid";

export const thunkUpdateCircleDefinition = appCreateAsyncThunk<{
  uuid: string;
  fieldName: "name" | "radius";
  value: string | number;
}>("updateCircleDefinition", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const landerCircleDefinitions = getState().mission.mission.circleDefinitions;
  const currentItem = landerCircleDefinitions?.[uuid];
  if (currentItem) {
    const newLanderCircleDefinitions = cloneDeep(getState().mission.mission.circleDefinitions);
    (newLanderCircleDefinitions[uuid] as { [key in typeof fieldName]: typeof value })[fieldName] =
      value;
    dispatch(upsertMissionByField("circleDefinitions", newLanderCircleDefinitions));
  }
});

export const thunkDeleteCircleDefinition = appCreateAsyncThunk<{ circleDefUuid: string }>(
  "deleteCircleDefinition",
  async ({ circleDefUuid }, { dispatch, getState }) => {
    const circleDefinitions = getState().mission.mission.circleDefinitions;
    const newCircleDefinitions = cloneDeep(circleDefinitions);
    delete newCircleDefinitions?.[circleDefUuid];
    dispatch(
      upsertMission({ ...getState().mission.mission, circleDefinitions: newCircleDefinitions })
    );
  }
);

export const thunkCreateCircleDefinition = appCreateAsyncThunk<void, string>(
  "createCircleDefinition",
  async (_, { dispatch, getState }) => {
    const circleDefUuid = uuidv4();
    const blankCircleDef: CircleDefinition = {
      name: "(Circle Definition Name)",
      radius: 0,
    };

    const circleDefinitions = getState().mission.mission.circleDefinitions || {};
    const newCircleDefinitions = {
      ...circleDefinitions,
      [circleDefUuid]: blankCircleDef,
    };
    dispatch(upsertMissionByField("circleDefinitions", newCircleDefinitions));

    return circleDefUuid;
  }
);
