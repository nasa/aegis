import { createTestMission } from "../factories/MissionFactory";
import { getStmNames, makeEquipmentReadable } from "utils/export";
import { v4 as uuidv4 } from "uuid";

describe("Export tests", () => {
  test("getStmNames", () => {
    const objective = {
      uuid: uuidv4(),
      numbering: "4",
      name: "test objective",
      missionId: 999,
    };
    const goal = {
      uuid: uuidv4(),
      numbering: "z",
      name: "test goal",
      objectiveUuid: objective.uuid,
    };
    const invstg = {
      uuid: uuidv4(),
      numbering: "3",
      name: "test invstg",
      goalUuid: goal.uuid,
    };
    const stmNames = getStmNames({
      stmUuidRefs: [invstg.uuid, uuidv4()],
      investigations: [invstg],
      goals: [goal],
      objectives: [objective],
    });
    expect(stmNames[0]).toEqual("4z3 test invstg");
    expect(stmNames[1]).toEqual("");
  });

  test("makeEquipmentReadable", () => {
    const mission = createTestMission();
    const equipmentItem: EquipmentItem = {
      uuid: uuidv4(),
      name: "test equipment",
      quantity: 99,
      singleUse: false,
    };
    mission.equipmentItems = [equipmentItem];
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
