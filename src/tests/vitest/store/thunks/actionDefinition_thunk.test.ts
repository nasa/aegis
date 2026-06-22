import { thunkDocDeleteActionDefItem } from "store/thunk/thunkActionDefinitions"; // Adjust this import path if necessary
import { createTestStoreWithAutomergeMission } from "tests/vitest/fixtures/store";
import type { StoreType } from "store";
import { generateBlankAction } from "../../../../store/storeUtils/action"; // Importing the method to generate actions
import { generateBlankStmRule } from "store/storeUtils/stm";
import { generateBlankActionTemplate } from "store/storeUtils/mission";
import { upsertSTMRules } from "store/stm";
import { v4 as uuidv4 } from "uuid";
import { getMissionDocHandle, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

let store: StoreType;

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
  store = createTestStoreWithAutomergeMission();
});

afterAll(() => {
  alertSpy.mockRestore();
});

describe("Thunk Action Definition Item Tests", () => {
  test("thunkDocDeleteActionDefItem - deletion blocked if in use", async () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const actionDefinitionsCount = Object.keys(
      missionDocHandle.doc().actionDefinitions[actionDefType]
    ).length;

    // Generate an action using this definition item
    const newAction = generateBlankAction({
      stmAction: true,
      actionDefinition: { verbUuid: actionDefUuid, nounUuid: null, adjectiveUuid: null },
    });
    missionDocHandle.change((mission) => {
      mission.actions[newAction.uuid] = newAction;
    });

    await store.dispatch(thunkDocDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      actionDefinitionsCount
    ); // Deletion should be blocked
  });

  test("thunkDocDeleteActionDefItem - successfully deletes if not in use", async () => {
    const missionDocHandle = getMissionDocHandle();

    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const actionDefinitionsCount = Object.keys(
      missionDocHandle.doc().actionDefinitions[actionDefType]
    ).length;

    await store.dispatch(thunkDocDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      actionDefinitionsCount - 1
    );
  });

  test("thunkDocDeleteActionDefItem - deletion blocked if in use by an STM rule", async () => {
    const missionDocHandle = getMissionDocHandle();
    const actionDefType: ActionDefinitionType = "verbs";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const countBefore = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length;

    // create an STM rule that uses the action def
    const stmLvl3Uuid = store.getState().stm.level3s[0].uuid;
    const rule = generateBlankStmRule({ stmUuid: stmLvl3Uuid });
    rule.verbUuids = [actionDefUuid];
    store.dispatch(upsertSTMRules([rule]));

    await store.dispatch(thunkDocDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore
    );
  });

  test("thunkDocDeleteActionDefItem - deletion blocked if in use by an Action Template", async () => {
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

    await store.dispatch(thunkDocDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      countBefore
    );
  });

  test("thunkDocDeleteActionDefItem - blocked alert includes all blocker types", async () => {
    const missionDocHandle = getMissionDocHandle();
    const actionDefType: ActionDefinitionType = "adjectives";
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];

    // create an action AND a rule AND a template that all reference the same def
    const newAction = generateBlankAction({
      stmAction: true,
      actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: actionDefUuid },
    });
    missionDocHandle.change((m) => {
      m.actions[newAction.uuid] = newAction;
    });

    const stmLvl3Uuid = store.getState().stm.level3s[0].uuid;
    const rule = generateBlankStmRule({ stmUuid: stmLvl3Uuid });
    rule.adjectiveUuids = [actionDefUuid];
    store.dispatch(upsertSTMRules([rule]));

    const template = generateBlankActionTemplate({
      templateName: "Vitest Combo Template",
      actionDefinition: { verbUuid: null, nounUuid: null, adjectiveUuid: actionDefUuid },
    });
    const templateUuid = uuidv4();
    missionDocHandle.change((m) => {
      m.actionTemplates[templateUuid] = template;
    });

    await store.dispatch(thunkDocDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const alertMsg = alertSpy.mock.calls[0][0] as string;
    expect(alertMsg).toContain("Action in Station");
    expect(alertMsg).toContain("Rule in STM Item");
    expect(alertMsg).toContain("Action Template");
  });
});
