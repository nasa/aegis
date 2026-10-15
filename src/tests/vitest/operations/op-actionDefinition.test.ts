import { opDeleteActionDefinitionItem } from "operations/op-actionDefinition";
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankStmRule } from "store/storeUtils/stm";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { v4 as uuidv4 } from "uuid";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

beforeAll(() => {
  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  vi.clearAllMocks();
  // Populates the mocked mission doc handle with the full fixture mission
  createTestStoreWithAutomergeMission();
});

/** Looks up a fixture entity uuid by its name within one of the mission doc's entity maps. */
const findFixtureUuidByName = (
  entityMapKey: "stations" | "traverses" | "pois",
  name: string
): string => {
  const entityMap = getMissionDocHandle().doc()[entityMapKey];
  const match = Object.values(entityMap).find((entity) => entity.name === name);
  if (!match) throw new Error(`Fixture ${entityMapKey} named "${name}" not found`);
  return match.uuid;
};

describe("opDeleteActionDefinitionItem()", () => {
  test("deletion blocked if in use by a Station action", () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const actionDefinitionsCount = Object.keys(
      missionDocHandle.doc().actionDefinitions[actionDefType]
    ).length;

    // Generate a station-parented action using this definition item
    const newAction = generateBlankAction({
      stmAction: true,
      stationUuid: findFixtureUuidByName("stations", "Vitest Station-1"),
      actionDefinition: { verbUuid: actionDefUuid, nounUuid: null, adjectiveUuid: null },
    });
    missionDocHandle.change((mission) => {
      mission.actions[newAction.uuid] = newAction;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeDefined();
    expect(inUseMessage).toContain("Action in Station: Vitest Station-1");
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      actionDefinitionsCount
    ); // Deletion should be blocked
  });

  test("deletion blocked if in use by a Traverse action", () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    const newAction = generateBlankAction({
      stmAction: true,
      traverseUuid: findFixtureUuidByName("traverses", "Vitest Traverse-1"),
      actionDefinition: { verbUuid: actionDefUuid, nounUuid: null, adjectiveUuid: null },
    });
    missionDocHandle.change((mission) => {
      mission.actions[newAction.uuid] = newAction;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeDefined();
    expect(inUseMessage).toContain("Action in Traverse: Vitest Traverse-1");
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore
    );
  });

  test("deletion blocked if in use by a POI action", () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    const newAction = generateBlankAction({
      stmAction: true,
      poiUuid: findFixtureUuidByName("pois", "Vitest POI-1"),
      actionDefinition: { verbUuid: actionDefUuid, nounUuid: null, adjectiveUuid: null },
    });
    missionDocHandle.change((mission) => {
      mission.actions[newAction.uuid] = newAction;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeDefined();
    expect(inUseMessage).toContain("Action in POI: Vitest POI-1");
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore
    );
  });

  test("non-STM actions do not block deletion", () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    // stmAction false means the definition reference is ignored by the in-use check
    const newAction = generateBlankAction({
      stmAction: false,
      stationUuid: findFixtureUuidByName("stations", "Vitest Station-1"),
      actionDefinition: { verbUuid: actionDefUuid, nounUuid: null, adjectiveUuid: null },
    });
    missionDocHandle.change((mission) => {
      mission.actions[newAction.uuid] = newAction;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeUndefined();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore - 1
    );
  });

  test("actions with a null actionDefinition do not throw", () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    // An STM action that has not had its verb/noun/adjective assigned yet
    const newAction = generateBlankAction({
      stmAction: true,
      stationUuid: findFixtureUuidByName("stations", "Vitest Station-1"),
      actionDefinition: null,
    });
    missionDocHandle.change((mission) => {
      mission.actions[newAction.uuid] = newAction;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeUndefined();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore - 1
    );
  });

  test("successfully deletes if not in use", () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const actionDefinitionsCount = Object.keys(
      missionDocHandle.doc().actionDefinitions[actionDefType]
    ).length;

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeUndefined();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      actionDefinitionsCount - 1
    );
  });

  test("deletion blocked if in use by an STM rule", () => {
    const missionDocHandle = getMissionDocHandle();
    const actionDefType: ActionDefinitionType = "verbs";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    // create an STM rule that uses the action def
    const stmLvl3Uuid = Object.keys(missionDocHandle.doc().stmLevel3s)[0];
    const rule = generateBlankStmRule({ stmUuid: stmLvl3Uuid });
    rule.verbUuids = [actionDefUuid];
    missionDocHandle.change((m) => {
      m.stmRules[rule.uuid] = rule;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeDefined();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore
    );
  });

  test("deletion blocked if in use by an Action Template", () => {
    const missionDocHandle = getMissionDocHandle();
    const actionDefType: ActionDefinitionType = "nouns";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    // create an action template that uses the action def as its nounUuid
    const template = generateBlankActionTemplate({
      templateName: "Vitest Template",
      actionDefinition: { verbUuid: null, nounUuid: actionDefUuid, adjectiveUuid: null },
    });
    const templateUuid = uuidv4();
    missionDocHandle.change((m) => {
      m.actionTemplates[templateUuid] = template;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeDefined();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore
    );
  });

  test("blocked alert includes all blocker types", () => {
    const missionDocHandle = getMissionDocHandle();
    const actionDefType: ActionDefinitionType = "adjectives";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];

    // create an action AND a rule AND a template that all reference the same def
    const newAction = generateBlankAction({
      stmAction: true,
      stationUuid: findFixtureUuidByName("stations", "Vitest Station-1"),
      actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: actionDefUuid },
    });
    missionDocHandle.change((m) => {
      m.actions[newAction.uuid] = newAction;
    });

    const stmLvl3Uuid = Object.keys(missionDocHandle.doc().stmLevel3s)[0];
    const rule = generateBlankStmRule({ stmUuid: stmLvl3Uuid });
    rule.adjectiveUuids = [actionDefUuid];
    missionDocHandle.change((m) => {
      m.stmRules[rule.uuid] = rule;
    });

    const template = generateBlankActionTemplate({
      templateName: "Vitest Combo Template",
      actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: actionDefUuid },
    });
    const templateUuid = uuidv4();
    missionDocHandle.change((m) => {
      m.actionTemplates[templateUuid] = template;
    });

    const inUseMessage = opDeleteActionDefinitionItem(missionDocHandle, {
      type: actionDefType,
      uuid: actionDefUuid,
    });
    expect(inUseMessage).toBeDefined();
    expect(inUseMessage).toContain("Action in Station");
    expect(inUseMessage).toContain("Rule in STM Item");
    expect(inUseMessage).toContain("Action Template");
  });
});
