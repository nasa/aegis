import { generateBlankMission } from "store/storeUtils/mission";
import { makeEquipmentReadable, makeExportString } from "utils/export";
import { v4 as uuidv4 } from "uuid";

describe("Export tests", () => {
  test("makeEquipmentReadable", () => {
    const equipmentItemUuid = uuidv4();
    const equipmentItem = {
      name: "Vitest test equipment",
      quantity: 99,
      singleUse: false,
    };
    const mission = generateBlankMission({
      name: "Vitest Mission-1",
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
    expect(readable[0]).toEqual({
      name: "Vitest test equipment",
      singleUse: false,
      quantityUsed: 5,
    });
    expect(readable[1]).toEqual({ name: undefined, singleUse: undefined, quantityUsed: 3 });
  });

  test("exports full LGRS coordinates", () => {
    const mission = generateBlankMission({ name: "LGRS Export Mission" });
    mission.usingLGRSCoordinates = true;
    mission.landerLocation = { lat: -89, lng: -133 };

    const output = makeExportString({
      mission,
      selectEvas: false,
      selectMission: true,
      selectPois: false,
      selectStations: false,
      selectActions: false,
      selectTraverses: false,
      selectRexes: false,
    });

    expect(JSON.parse(output).exportMission.gridCoordinates).toBe("AZM B95 D44");
  });
});
