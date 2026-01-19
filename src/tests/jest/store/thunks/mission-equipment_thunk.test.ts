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
import { v4 as uuidv4 } from "uuid";

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
    const equipCount = Object.keys(store.getState().mission.mission.equipmentItems || {}).length;

    await store.dispatch(thunkCreateEquipment());
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toEqual(
      equipCount + 1
    );

    await store.dispatch(thunkCreateEquipment());
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toEqual(
      equipCount + 2
    );
  });

  test("thunkUpdateEquipment()", async () => {
    await store.dispatch(thunkCreateEquipment());
    const equipCount = Object.keys(store.getState().mission.mission.equipmentItems).length;
    const equipmentItems = store.getState().mission.mission.equipmentItems;
    const equipItemUuid = Object.keys(equipmentItems)[0];
    await store.dispatch(
      thunkUpdateEquipment({
        uuid: equipItemUuid,
        fieldName: "name",
        value: "Test Equip Item Modified",
      })
    );
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toBe(equipCount);
    expect(store.getState().mission.mission.equipmentItems[equipItemUuid].name).toBe(
      "Test Equip Item Modified"
    );
  });

  test("thunkDeleteEquipment() on action", async () => {
    await store.dispatch(thunkCreateEquipment());
    const equipCount = Object.keys(store.getState().mission.mission.equipmentItems).length;

    // assign an equip item to an action
    const equipUuidForAction = Object.keys(store.getState().mission.mission.equipmentItems)[0];
    const action = store.getState().action.actions[0];
    store.dispatch(
      upsertActionByField(action.uuid, "equipmentItemsUsage", {
        [equipUuidForAction]: {
          quantityUsed: 1,
        },
      })
    );

    // should fail to to delete.
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForAction }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toBe(equipCount);

    // remove from action and try to delete again. should succeed
    store.dispatch(upsertActionByField(action.uuid, "equipmentItemsUsage", {}));
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForAction }));
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toBe(
      equipCount - 1
    );
    expect(store.getState().mission.mission.equipmentItems[equipUuidForAction]).toBeUndefined();
  });

  test("thunkDeleteEquipment() on action template", async () => {
    await store.dispatch(thunkCreateEquipment());
    const equipCount = Object.keys(store.getState().mission.mission.equipmentItems).length;

    // assign an equip item to a template
    const equipUuidForTemplate = Object.keys(store.getState().mission.mission.equipmentItems)[0];
    const actionTemplate = generateBlankActionTemplate({
      templateName: "Jest Action Template",
      equipmentItemsUsage: { [equipUuidForTemplate]: { quantityUsed: 1 } },
    });
    store.dispatch(upsertMissionByField("actionTemplates", { [uuidv4()]: actionTemplate }));

    // try to delete
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForTemplate }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toBe(equipCount);

    // remove from action template and try to delete again. should succeed
    store.dispatch(upsertMissionByField("actionTemplates", {}));
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForTemplate }));
    expect(Object.keys(store.getState().mission.mission.equipmentItems).length).toBe(
      equipCount - 1
    );
    expect(store.getState().mission.mission.equipmentItems[equipUuidForTemplate]).toBeUndefined();
  });
});
