import {
  thunkCreateActionDefItem,
  thunkUpdateActionDefItem,
  thunkDeleteActionDefItem,
} from "store/thunk/thunkActionDefinitions"; // Adjust this import path if necessary
import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import { StoreType } from "store";
import { generateBlankAction } from "../../../../store/storeUtils/action"; // Importing the method to generate actions
import { upsertActions } from "store/action";

const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});

let store: StoreType;

beforeEach(() => {
  jest.clearAllMocks();
  store = createFullTestStore();
});

afterAll(() => {
  alertSpy.mockRestore();
});

describe("Thunk Action Definition Item Tests", () => {
  test("thunkCreateActionDefItem", async () => {
    const actionDefType: ActionDefinitionType = "verbs"; // or "nouns", "adjectives"

    const actionDefCount = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    ).length;

    await store.dispatch(thunkCreateActionDefItem({ type: actionDefType }));
    expect(
      Object.keys(store.getState().mission.mission.actionDefinitions[actionDefType]).length
    ).toEqual(actionDefCount + 1);

    await store.dispatch(thunkCreateActionDefItem({ type: actionDefType }));
    expect(
      Object.keys(store.getState().mission.mission.actionDefinitions[actionDefType]).length
    ).toEqual(actionDefCount + 2);
  });

  test("thunkUpdateActionDefItem", async () => {
    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    await store.dispatch(thunkCreateActionDefItem({ type: actionDefType }));
    const actionDefCount = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    ).length;
    const actionDefUuid = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    )[0];
    await store.dispatch(
      thunkUpdateActionDefItem({
        type: actionDefType,
        uuid: actionDefUuid,
        fieldName: "name",
        value: "Updated Action Definition",
      })
    );

    expect(
      Object.keys(store.getState().mission.mission.actionDefinitions[actionDefType]).length
    ).toBe(actionDefCount);
    expect(
      store.getState().mission.mission.actionDefinitions[actionDefType][actionDefUuid].name
    ).toBe("Updated Action Definition");
  });

  test("thunkDeleteActionDefItem - deletion blocked if in use", async () => {
    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    )[0];
    const actionDefinitionsCount = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    ).length;

    // Generate an action using this definition item
    const newAction = generateBlankAction({
      stmAction: true,
      actionDefinition: { verbUuid: actionDefUuid, nounUuid: null, adjectiveUuid: null },
    });
    await store.dispatch(upsertActions([newAction]));

    await store.dispatch(thunkDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(
      Object.keys(store.getState().mission.mission.actionDefinitions[actionDefType]).length
    ).toBe(actionDefinitionsCount); // Deletion should be blocked
  });

  test("thunkDeleteActionDefItem - successfully deletes if not in use", async () => {
    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    )[0];
    const actionDefinitionsCount = Object.keys(
      store.getState().mission.mission.actionDefinitions[actionDefType]
    ).length;

    await store.dispatch(thunkDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(
      Object.keys(store.getState().mission.mission.actionDefinitions[actionDefType]).length
    ).toBe(actionDefinitionsCount - 1);
  });
});
