import {
  getMissionDocHandle,
  setMissionAutomergeDocHandle,
  withMissionChange,
} from "client/automergeDocHandles";
import {
  applyCreateEquipmentItem,
  applyUpdateEquipmentItemByField,
} from "client/automerge/apply/apply-mission-equipment";
import { v4 as uuidv4 } from "uuid";

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

describe("apply-mission-equipment", () => {
  describe("withMissionChange((m) => applyCreateEquipmentItem(m))", () => {
    it("adds a new equipment item to the mission", () => {
      withMissionChange((m) => applyCreateEquipmentItem(m));

      const doc = getMissionDocHandle().doc();
      expect(Object.keys(doc.equipmentItems)).toHaveLength(1);
    });

    it("creates equipment item with default values", () => {
      withMissionChange((m) => applyCreateEquipmentItem(m));

      const items = Object.values(getMissionDocHandle().doc().equipmentItems);
      expect(items[0].name).toBe("(Equipment Name)");
      expect(items[0].quantity).toBe(1);
      expect(items[0].singleUse).toBe(false);
    });
  });

  describe("applyUpdateEquipmentItemByField()", () => {
    it("updates the name of an existing equipment item", () => {
      withMissionChange((m) => applyCreateEquipmentItem(m));
      const missionDocHandle = getMissionDocHandle();
      const equipUuid = Object.keys(missionDocHandle.doc().equipmentItems)[0];

      withMissionChange((m) =>
        applyUpdateEquipmentItemByField(m, {
          equipmentUuid: equipUuid,
          fieldName: "name",
          value: "Hammer",
        })
      );

      expect(missionDocHandle.doc().equipmentItems[equipUuid].name).toBe("Hammer");
    });

    it("updates the quantity of an existing equipment item", () => {
      withMissionChange((m) => applyCreateEquipmentItem(m));
      const missionDocHandle = getMissionDocHandle();
      const equipUuid = Object.keys(missionDocHandle.doc().equipmentItems)[0];

      withMissionChange((m) =>
        applyUpdateEquipmentItemByField(m, {
          equipmentUuid: equipUuid,
          fieldName: "quantity",
          value: 5,
        })
      );

      expect(missionDocHandle.doc().equipmentItems[equipUuid].quantity).toBe(5);
    });

    it("updates mission updatedAt", () => {
      withMissionChange((m) => applyCreateEquipmentItem(m));
      const missionDocHandle = getMissionDocHandle();
      const equipUuid = Object.keys(missionDocHandle.doc().equipmentItems)[0];
      const before = missionDocHandle.doc().updatedAt;
      vi.spyOn(Date.prototype, "getTime").mockReturnValueOnce(before + 10);

      withMissionChange((m) =>
        applyUpdateEquipmentItemByField(m, {
          equipmentUuid: equipUuid,
          fieldName: "name",
          value: "New Name",
        })
      );

      expect(missionDocHandle.doc().updatedAt).toBeGreaterThan(before);
    });

    it("does nothing when equipment item uuid does not exist", () => {
      expect(() =>
        withMissionChange((m) =>
          applyUpdateEquipmentItemByField(m, {
            equipmentUuid: uuidv4(),
            fieldName: "name",
            value: "x",
          })
        )
      ).not.toThrow();
    });
  });
});
