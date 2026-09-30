import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import { applyCreateEquipmentItem } from "operations/apply/apply-mission-equipment";
import { thunkDocDeleteEquipmentItem } from "store/thunk/thunkMissionEquipment";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";
import { createCustomTestStore } from "../../fixtures/store";

beforeAll(() => {
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  getMissionDocHandle().change((m) => {
    m.equipmentItems = {};
    m.actions = {};
    m.actionTemplates = {};
    m.stations = {};
    m.pois = {};
  });
  vi.spyOn(window, "alert").mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("thunkDocDeleteEquipmentItem", () => {
  it("deletes the equipment item when it is not used by any action or template", async () => {
    const equipmentItemUuid = withMissionChange((m) => applyCreateEquipmentItem(m));

    const store = createCustomTestStore({});
    await store.dispatch(thunkDocDeleteEquipmentItem({ equipmentItemUuid }));

    expect(getMissionDocHandle().doc().equipmentItems[equipmentItemUuid]).toBeUndefined();
  });

  it("returns a rejection with a message when equipment is used by an action", async () => {
    const equipmentItemUuid = uuidv4();
    const action = generateBlankAction({
      equipmentItemsUsage: { [equipmentItemUuid]: { quantityUsed: 1 } },
      stationUuid: uuidv4(),
    });
    getMissionDocHandle().change((m) => {
      m.equipmentItems[equipmentItemUuid] = {
        name: "Vitest Drill",
        quantity: 1,
        singleUse: false,
      };
      m.actions[action.uuid] = action;
      m.stations[action.stationUuid] = {
        uuid: action.stationUuid,
        name: "Vitest Station A",
      } as unknown as Station;
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocDeleteEquipmentItem({ equipmentItemUuid }));

    expect(thunkDocDeleteEquipmentItem.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("being used by one or more actions");
    expect(getMissionDocHandle().doc().equipmentItems[equipmentItemUuid]).toBeDefined();
  });

  it("returns a rejection with a message when equipment is used by an action template", async () => {
    const equipmentItemUuid = uuidv4();
    const template = generateBlankActionTemplate({
      templateName: "Template",
      equipmentItemsUsage: { [equipmentItemUuid]: { quantityUsed: 1 } },
    });
    const templateUuid = uuidv4();
    getMissionDocHandle().change((m) => {
      m.equipmentItems[equipmentItemUuid] = {
        name: "Vitest Drill",
        quantity: 1,
        singleUse: false,
      };
      m.actionTemplates[templateUuid] = template;
    });

    const store = createCustomTestStore({});
    const result = await store.dispatch(thunkDocDeleteEquipmentItem({ equipmentItemUuid }));

    expect(thunkDocDeleteEquipmentItem.rejected.match(result)).toBe(true);
    expect(result.payload).toContain("being used by one or more actions");
    expect(getMissionDocHandle().doc().equipmentItems[equipmentItemUuid]).toBeDefined();
  });
});
