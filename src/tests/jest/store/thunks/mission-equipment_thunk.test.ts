import {
  thunkCreateEquipment,
  thunkDeleteEquipment,
  thunkUpdateEquipment,
} from "store/thunk/thunkMission-equipment";
import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import { StoreType } from "store";
import { upsertActionByField } from "store/action";
import { upsertMissionByField } from "store/mission";
import { generateBlankActionTemplate } from "store/storeUtils/mission";

const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});

let store: StoreType;
beforeAll(() => {
  store = createFullTestStore();
});

beforeEach(() => {
  // clear all call counts between each test
  jest.clearAllMocks();
});

afterAll(() => {
  // restore original implementation
  alertSpy.mockRestore();
});

describe("Thunk Mission Equipment Tests", () => {
  test("thunkCreateEquipment", async () => {
    const equipCount = store.getState().mission.mission.equipmentItems?.length || 0;

    await store.dispatch(thunkCreateEquipment());
    expect(store.getState().mission.mission.equipmentItems.length).toEqual(equipCount + 1);

    await store.dispatch(thunkCreateEquipment());
    expect(store.getState().mission.mission.equipmentItems.length).toEqual(equipCount + 2);
  });

  test("thunkUpdateEquipment()", async () => {
    await store.dispatch(thunkCreateEquipment());
    const equipCount = store.getState().mission.mission.equipmentItems.length;
    const equipItem = store.getState().mission.mission.equipmentItems[0];
    await store.dispatch(
      thunkUpdateEquipment({
        uuid: equipItem.uuid,
        fieldName: "name",
        value: "Test Equip Item Modified",
      })
    );
    expect(store.getState().mission.mission.equipmentItems.length).toBe(equipCount);
    expect(
      store.getState().mission.mission.equipmentItems.find((e) => e.uuid === equipItem.uuid).name
    ).toBe("Test Equip Item Modified");
  });

  test("thunkDeleteEquipment() on action", async () => {
    await store.dispatch(thunkCreateEquipment());
    const equipCount = store.getState().mission.mission.equipmentItems.length;

    // assign an equip item to an action
    const equipUuidForAction = store.getState().mission.mission.equipmentItems[0].uuid;
    const action = store.getState().action.actions[0];
    store.dispatch(
      upsertActionByField(action.uuid, "equipmentItemsUsage", [
        {
          uuid: equipUuidForAction,
          quantityUsed: 1,
        },
      ])
    );

    // should fail to to delete.
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForAction }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().mission.mission.equipmentItems.length).toBe(equipCount);

    // remove from action and try to delete again. should succeed
    store.dispatch(upsertActionByField(action.uuid, "equipmentItemsUsage", []));
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForAction }));
    expect(store.getState().mission.mission.equipmentItems.length).toBe(equipCount - 1);
    expect(
      store.getState().mission.mission.equipmentItems.find((e) => e.uuid === equipUuidForAction)
    ).toBeUndefined();
  });

  test("thunkDeleteEquipment() on action template", async () => {
    await store.dispatch(thunkCreateEquipment());
    const equipCount = store.getState().mission.mission.equipmentItems.length;

    // assign an equip item to a template
    const equipUuidForTemplate = store.getState().mission.mission.equipmentItems[0].uuid;
    const actionTemplate = generateBlankActionTemplate({
      templateName: "Jest Action Template",
      equipmentItemsUsage: [{ uuid: equipUuidForTemplate, quantityUsed: 1 }],
    });
    store.dispatch(upsertMissionByField("actionTemplates", [actionTemplate]));

    // try to delete
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForTemplate }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(store.getState().mission.mission.equipmentItems.length).toBe(equipCount);

    // remove from action template and try to delete again. should succeed
    store.dispatch(upsertMissionByField("actionTemplates", []));
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForTemplate }));
    expect(store.getState().mission.mission.equipmentItems.length).toBe(equipCount - 1);
    expect(
      store.getState().mission.mission.equipmentItems.find((e) => e.uuid === equipUuidForTemplate)
    ).toBeUndefined();
  });
});
