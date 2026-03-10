import { thunkDeleteEquipment } from "store/thunk/thunkMission-equipment";
import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import { StoreType } from "store";
import { upsertActionByField } from "store/action";
import { generateBlankActionTemplate, generateBlankEquipmentItem } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";
import { getAutomergeDocHandles, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
let store: StoreType;

beforeAll(() => {
  store = createFullTestStore();

  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked in jest.setup.ts so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
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
  test("thunkDeleteEquipment() on action", async () => {
    const missionDocHandle = getAutomergeDocHandles().mission;

    const newEquipItem = generateBlankEquipmentItem({ name: "Jest Equipment Item" });
    const newEquipItemUuid = uuidv4();
    missionDocHandle.change((mission) => {
      mission.equipmentItems[newEquipItemUuid] = newEquipItem;
    });
    const equipCount = Object.keys(missionDocHandle.doc().equipmentItems).length;

    // assign an equip item to an action
    const equipUuidForAction = Object.keys(missionDocHandle.doc().equipmentItems)[0];
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
    expect(Object.keys(missionDocHandle.doc().equipmentItems).length).toBe(equipCount);

    // remove from action and try to delete again. should succeed
    store.dispatch(upsertActionByField(action.uuid, "equipmentItemsUsage", {}));
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForAction }));
    expect(Object.keys(missionDocHandle.doc().equipmentItems).length).toBe(equipCount - 1);
    expect(missionDocHandle.doc().equipmentItems[equipUuidForAction]).toBeUndefined();
  });

  test("thunkDeleteEquipment() on action template", async () => {
    const missionDocHandle = getAutomergeDocHandles().mission;

    const newEquipItem = generateBlankEquipmentItem({ name: "Jest Equipment Item" });
    const newEquipItemUuid = uuidv4();
    missionDocHandle.change((mission) => {
      mission.equipmentItems[newEquipItemUuid] = newEquipItem;
    });
    const equipCount = Object.keys(missionDocHandle.doc().equipmentItems).length;

    // assign an equip item to a template
    const equipUuidForTemplate = Object.keys(missionDocHandle.doc().equipmentItems)[0];
    const actionTemplate = generateBlankActionTemplate({
      templateName: "Jest Action Template",
      equipmentItemsUsage: { [equipUuidForTemplate]: { quantityUsed: 1 } },
    });
    missionDocHandle.change((mission) => {
      mission.actionTemplates = { [uuidv4()]: actionTemplate };
    });

    // try to delete
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForTemplate }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().equipmentItems).length).toBe(equipCount);

    // remove from action template and try to delete again. should succeed
    missionDocHandle.change((mission) => {
      mission.actionTemplates = {};
    });
    await store.dispatch(thunkDeleteEquipment({ equipmentItemUuid: equipUuidForTemplate }));
    expect(Object.keys(missionDocHandle.doc().equipmentItems).length).toBe(equipCount - 1);
    expect(missionDocHandle.doc().equipmentItems[equipUuidForTemplate]).toBeUndefined();
  });
});
