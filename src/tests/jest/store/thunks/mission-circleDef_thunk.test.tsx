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
    const geoUnitCount = store.getState().mission.mission.circleDefinitions?.length || 0;

    await store.dispatch(thunkCreateCircleDefinition());
    expect(store.getState().mission.mission.circleDefinitions.length).toEqual(geoUnitCount + 1);

    await store.dispatch(thunkCreateCircleDefinition());
    expect(store.getState().mission.mission.circleDefinitions.length).toEqual(geoUnitCount + 2);
  });

  test("thunkUpdateCircleDefinition()", async () => {
    await store.dispatch(thunkCreateCircleDefinition());
    const circleDefinitionCount = store.getState().mission.mission.circleDefinitions.length;
    const circleDefinition = store.getState().mission.mission.circleDefinitions[0];
    await store.dispatch(
      thunkUpdateCircleDefinition({
        uuid: circleDefinition.uuid,
        fieldName: "name",
        value: "Test Circle Definition Modified",
      })
    );
    expect(store.getState().mission.mission.circleDefinitions.length).toBe(circleDefinitionCount);
    expect(
      store
        .getState()
        .mission.mission.circleDefinitions.find((e) => e.uuid === circleDefinition.uuid).name
    ).toBe("Test Circle Definition Modified");
  });

  test("thunkDeleteCircleDefinition()", async () => {
    await store.dispatch(thunkCreateCircleDefinition());
    const circleDefinitionCount = store.getState().mission.mission.circleDefinitions.length;
    const circleDefinition = store.getState().mission.mission.circleDefinitions[0];

    await store.dispatch(thunkDeleteCircleDefinition({ circleDefUuid: circleDefinition.uuid }));
    expect(store.getState().mission.mission.circleDefinitions.length).toBe(
      circleDefinitionCount - 1
    );
    expect(
      store
        .getState()
        .mission.mission.circleDefinitions.find((r) => r.uuid === circleDefinition.uuid)
    ).toBe(undefined);
  });
});
