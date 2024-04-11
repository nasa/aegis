import { generateBlankMission } from "store/storeUtils/mission";
import { getStmNames, makeEquipmentReadable } from "utils/export";
import { v4 as uuidv4 } from "uuid";

describe("Export tests", () => {
  test("getStmNames", () => {
    const level1 = {
      uuid: uuidv4(),
      numbering: "4",
      name: "test level1",
      missionId: 999,
    };
    const level2 = {
      uuid: uuidv4(),
      numbering: "z",
      name: "test level2",
      level1Uuid: level1.uuid,
    };
    const level3 = {
      uuid: uuidv4(),
      numbering: "3",
      name: "test level3",
      level2Uuid: level2.uuid,
    };
    const stmNames = getStmNames({
      stmUuidRefs: [level3.uuid, uuidv4()],
      level3s: [level3],
      level2s: [level2],
      level1s: [level1],
    });
    expect(stmNames[0]).toEqual("4z3 test level3");
    expect(stmNames[1]).toEqual("");
  });

  test("makeEquipmentReadable", () => {
    const equipmentItem: EquipmentItem = {
      uuid: uuidv4(),
      name: "test equipment",
      quantity: 99,
      singleUse: false,
    };
    const mission = generateBlankMission({
      name: "Jest Mission-1",
      equipmentItems: [equipmentItem],
    });
    const equipmentItemUsage: EquipmentItemUsage = { uuid: equipmentItem.uuid, quantityUsed: 5 };
    const equipmentItemUsageNotFound: EquipmentItemUsage = { uuid: uuidv4(), quantityUsed: 3 };
    const readable = makeEquipmentReadable({
      equipmentItems: [equipmentItemUsage, equipmentItemUsageNotFound],
      mission: mission,
    });
    expect(readable[0]).toEqual({ name: "test equipment", singleUse: false, quantityUsed: 5 });
    expect(readable[1]).toEqual({ name: undefined, singleUse: undefined, quantityUsed: 3 });
  });
});
