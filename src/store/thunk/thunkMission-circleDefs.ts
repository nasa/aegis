import cloneDeep from "lodash/cloneDeep";
import appCreateAsyncThunk from "./thunkUtil";
import { upsertMission, upsertMissionByField } from "store/mission";
import { v4 as uuidv4 } from "uuid";

export const thunkUpdateCircleDefinition = appCreateAsyncThunk<{
  uuid: string;
  fieldName: keyof CircleDefinition;
  value: CircleDefinition[keyof CircleDefinition];
}>("updateCircleDefinition", async ({ uuid, fieldName, value }, { dispatch, getState }) => {
  const newLanderCircleDefinitions = cloneDeep(getState().mission.mission.circleDefinitions);
  const itemIndex = newLanderCircleDefinitions?.findIndex((item) => item.uuid === uuid);
  if (itemIndex >= 0) {
    (
      newLanderCircleDefinitions[itemIndex] as Record<
        typeof fieldName,
        CircleDefinition[keyof CircleDefinition]
      >
    )[fieldName] = value;
    dispatch(upsertMissionByField("circleDefinitions", newLanderCircleDefinitions));
  }
});

export const thunkDeleteCircleDefinition = appCreateAsyncThunk<{ circleDefUuid: string }>(
  "deleteCircleDefinition",
  async ({ circleDefUuid }, { dispatch, getState }) => {
    const newCircleDefinitions = getState().mission.mission.circleDefinitions?.filter(
      (item) => item.uuid !== circleDefUuid
    );
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
      uuid: circleDefUuid,
      name: "(Circle Definition Name)",
      radius: 0,
    };

    const circleDefinitions = getState().mission.mission.circleDefinitions || [];
    const circleDef = blankCircleDef;
    const newCircleDefinitions = [...circleDefinitions, circleDef];
    dispatch(upsertMissionByField("circleDefinitions", newCircleDefinitions));

    return circleDefUuid;
  }
);
