import { generateBlankAction } from "store/storeUtils/action";
import {
  DEFAULT_ACTION_DEFINITION_CONJUNCTIONS,
  DEFAULT_ACTION_DEFINITION_LABELS,
  generateBlankMission,
} from "store/storeUtils/mission";
import {
  makeEquipmentReadable,
  makeExportString,
  makeReadableActionDefinition,
  makeReadableMissionPriority,
} from "utils/export";
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

  test("makeReadableMissionPriority", () => {
    const missionPriorityUuid = uuidv4();
    const mission = generateBlankMission({
      name: "Vitest Mission-1",
      missionPriorities: {
        [missionPriorityUuid]: { trace: "SIMD-0005.1", category: "Vitest Category" },
      },
    });

    expect(makeReadableMissionPriority({ missionPriorityUuid, mission })).toEqual({
      uuid: missionPriorityUuid,
      trace: "SIMD-0005.1",
      category: "Vitest Category",
      displayString: "SIMD-0005.1 | Vitest Category",
    });
    expect(makeReadableMissionPriority({ missionPriorityUuid: null, mission })).toBeNull();
    expect(makeReadableMissionPriority({ missionPriorityUuid: uuidv4(), mission })).toBeNull();
  });

  describe("makeReadableActionDefinition", () => {
    const verbUuid = uuidv4();
    const nounUuid = uuidv4();
    const adjectiveUuid = uuidv4();
    const verb = { name: "Sample", abbr: "SAM" };
    const noun = { name: "Rock", abbr: "RCK" };
    const adjective = { name: "Crater", abbr: "CRT" };

    const buildMission = (
      overrides?: Partial<Pick<Mission, "actionDefinitionConjunctions" | "actionDefinitionLabels">>
    ): Pick<
      Mission,
      "actionDefinitions" | "actionDefinitionConjunctions" | "actionDefinitionLabels"
    > => ({
      actionDefinitions: {
        verbs: { [verbUuid]: verb },
        nouns: { [nounUuid]: noun },
        adjectives: { [adjectiveUuid]: adjective },
      },
      actionDefinitionConjunctions: structuredClone(DEFAULT_ACTION_DEFINITION_CONJUNCTIONS),
      actionDefinitionLabels: structuredClone(DEFAULT_ACTION_DEFINITION_LABELS),
      ...overrides,
    });

    test("returns verb, noun, and adjective with default conjunctions when all are selected", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid },
      });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Sample of Rock in Crater",
        verb: { uuid: verbUuid, ...verb },
        noun: { uuid: nounUuid, ...noun },
        adjective: { uuid: adjectiveUuid, ...adjective },
      });
    });

    test("omits the adjective and its conjunction when adjectiveUuid is null", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid: null },
      });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Sample of Rock",
        verb: { uuid: verbUuid, ...verb },
        noun: { uuid: nounUuid, ...noun },
        adjective: null,
      });
    });

    test("uses custom conjunctions when provided", () => {
      const mission = buildMission({
        actionDefinitionConjunctions: { verbToNoun: "on", nounToAdjective: "within" },
      });
      const action = generateBlankAction({
        actionDefinition: { verbUuid, nounUuid, adjectiveUuid },
      });

      expect(makeReadableActionDefinition({ action, mission }).displayString).toBe(
        "Sample on Rock within Crater"
      );
    });

    test("falls back to the definition labels when verb/noun are unselected", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: null },
      });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Verb of Noun",
        verb: null,
        noun: null,
        adjective: null,
      });
    });

    test("falls back to custom definition labels when verb/noun are unselected", () => {
      const mission = buildMission({
        actionDefinitionLabels: {
          verb: { singular: "Task", plural: "Tasks" },
          noun: { singular: "Target", plural: "Targets" },
          adjective: { singular: "Descriptor", plural: "Descriptors" },
        },
      });
      const action = generateBlankAction({
        actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: null },
      });

      expect(makeReadableActionDefinition({ action, mission }).displayString).toBe(
        "Task of Target"
      );
    });

    test("handles a null actionDefinition on the action", () => {
      const mission = buildMission();
      const action = generateBlankAction({ actionDefinition: null });

      expect(makeReadableActionDefinition({ action, mission })).toEqual({
        displayString: "Verb of Noun",
        verb: null,
        noun: null,
        adjective: null,
      });
    });

    test("returns null verb/noun/adjective when uuids no longer resolve in actionDefinitions", () => {
      const mission = buildMission();
      const action = generateBlankAction({
        actionDefinition: {
          verbUuid: uuidv4(),
          nounUuid: uuidv4(),
          adjectiveUuid: uuidv4(),
        },
      });

      const result = makeReadableActionDefinition({ action, mission });
      expect(result.verb).toEqual({ uuid: action.actionDefinition.verbUuid });
      expect(result.noun).toEqual({ uuid: action.actionDefinition.nounUuid });
      expect(result.adjective).toEqual({ uuid: action.actionDefinition.adjectiveUuid });
      // Unresolved verb/noun names fall back to the definition labels; an unresolved
      // adjective has no name, so its conjunction is omitted entirely.
      expect(result.displayString).toBe("Verb of Noun");
    });
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
