import { generateBlankMission } from "store/storeUtils/mission";
import { makeEquipmentReadable } from "utils/export";
import { v4 as uuidv4 } from "uuid";

describe("Export tests", () => {
  test("makeEquipmentReadable", () => {
    const equipmentItemUuid = uuidv4();
    const equipmentItem = {
      name: "test equipment",
      quantity: 99,
      singleUse: false,
    };
    const mission = generateBlankMission({
      name: "Jest Mission-1",
      equipmentItems: { [equipmentItemUuid]: equipmentItem },
    });
    const equipmentItemUsageNotFoundUuid = uuidv4();
    const equipmentItemsUsage: EquipmentItemUsages = {
      [equipmentItemUuid]: { quantityUsed: 5 },
      [equipmentItemUsageNotFoundUuid]: { quantityUsed: 3 },
    };
    const readable = makeEquipmentReadable({
      equipmentItems: equipmentItemsUsage,
      mission: mission,
    });
    expect(readable[0]).toEqual({ name: "test equipment", singleUse: false, quantityUsed: 5 });
    expect(readable[1]).toEqual({ name: undefined, singleUse: undefined, quantityUsed: 3 });
  });
});
