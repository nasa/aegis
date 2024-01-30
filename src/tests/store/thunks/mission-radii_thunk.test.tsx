import { createFullTestStore } from "tests/factories/makeTestStore";
import { StoreType } from "store";
import {
  thunkCreateLanderRadius,
  thunkDeleteLanderRadius,
  thunkUpdateLanderRadius,
} from "store/thunk/thunkMission-radii";

let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();
});
describe("Thunk Mission Radii Tests", () => {
  test("thunkCreateLanderRadius", async () => {
    const geoUnitCount = store.getState().mission.mission.landerRadii?.length || 0;

    await store.dispatch(thunkCreateLanderRadius());
    expect(store.getState().mission.mission.landerRadii.length).toEqual(geoUnitCount + 1);

    await store.dispatch(thunkCreateLanderRadius());
    expect(store.getState().mission.mission.landerRadii.length).toEqual(geoUnitCount + 2);
  });

  test("thunkUpdateLanderRadius()", async () => {
    await store.dispatch(thunkCreateLanderRadius());
    const radiiCount = store.getState().mission.mission.landerRadii.length;
    const radii = store.getState().mission.mission.landerRadii[0];
    await store.dispatch(
      thunkUpdateLanderRadius({
        uuid: radii.uuid,
        fieldName: "name",
        value: "Test Radii Modified",
      })
    );
    expect(store.getState().mission.mission.landerRadii.length).toBe(radiiCount);
    expect(
      store.getState().mission.mission.landerRadii.find((e) => e.uuid === radii.uuid).name
    ).toBe("Test Radii Modified");
  });

  test("thunkDeleteLanderRadius()", async () => {
    await store.dispatch(thunkCreateLanderRadius());
    const radiiCount = store.getState().mission.mission.landerRadii.length;
    const radii = store.getState().mission.mission.landerRadii[0];

    await store.dispatch(thunkDeleteLanderRadius({ landerRadiusUuid: radii.uuid }));
    expect(store.getState().mission.mission.landerRadii.length).toBe(radiiCount - 1);
    expect(store.getState().mission.mission.landerRadii.find((r) => r.uuid === radii.uuid)).toBe(
      undefined
    );
  });
});
