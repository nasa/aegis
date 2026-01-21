import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import { StoreType } from "store";
import {
  thunkCreateCircleDefinition,
  thunkDeleteCircleDefinition,
  thunkUpdateCircleDefinition,
} from "store/thunk/thunkMission-circleDefs";

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});
describe("Thunk Mission Circle Definitions Tests", () => {
  test("thunkCreateCircleDefinition", async () => {
    const geoUnitCount = Object.keys(
      store.getState().mission.mission.circleDefinitions || {}
    ).length;

    await store.dispatch(thunkCreateCircleDefinition());
    expect(Object.keys(store.getState().mission.mission.circleDefinitions).length).toEqual(
      geoUnitCount + 1
    );

    await store.dispatch(thunkCreateCircleDefinition());
    expect(Object.keys(store.getState().mission.mission.circleDefinitions).length).toEqual(
      geoUnitCount + 2
    );
  });

  test("thunkUpdateCircleDefinition()", async () => {
    await store.dispatch(thunkCreateCircleDefinition());
    const circleDefinitionCount = Object.keys(
      store.getState().mission.mission.circleDefinitions
    ).length;
    const circleDefinitionUuid = Object.keys(store.getState().mission.mission.circleDefinitions)[0];
    await store.dispatch(
      thunkUpdateCircleDefinition({
        uuid: circleDefinitionUuid,
        fieldName: "name",
        value: "Test Circle Definition Modified",
      })
    );
    expect(Object.keys(store.getState().mission.mission.circleDefinitions).length).toBe(
      circleDefinitionCount
    );
    expect(store.getState().mission.mission.circleDefinitions[circleDefinitionUuid].name).toBe(
      "Test Circle Definition Modified"
    );
  });

  test("thunkDeleteCircleDefinition()", async () => {
    await store.dispatch(thunkCreateCircleDefinition());
    const circleDefinitionCount = Object.keys(
      store.getState().mission.mission.circleDefinitions
    ).length;
    const circleDefinitionUuid = Object.keys(store.getState().mission.mission.circleDefinitions)[0];
    await store.dispatch(thunkDeleteCircleDefinition({ circleDefUuid: circleDefinitionUuid }));
    expect(Object.keys(store.getState().mission.mission.circleDefinitions).length).toBe(
      circleDefinitionCount - 1
    );
    expect(store.getState().mission.mission.circleDefinitions[circleDefinitionUuid]).toBe(
      undefined
    );
  });
});
