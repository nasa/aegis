import { generateBlankMission } from "store/storeUtils/mission";
import { makeEquipmentReadable } from "utils/export";
import { v4 as uuidv4 } from "uuid";

describe("Export tests", () => {
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
