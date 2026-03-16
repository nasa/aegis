import { thunkDeleteActionDefItem } from "store/thunk/thunkActionDefinitions"; // Adjust this import path if necessary
import { createFullTestStore } from "tests/jest/factories/makeTestStore";
import type { StoreType } from "store";
import { generateBlankAction } from "../../../../store/storeUtils/action"; // Importing the method to generate actions
import { upsertActions } from "store/action";
import { getAutomergeDocHandles, setMissionAutomergeDocHandle } from "client/automergeDocHandles";

const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});

let store: StoreType;

beforeAll(() => {
  /**
   * Init the mission automerge doc. In the app this is handled in the component.
   * Pass in null because this function is being mocked in jest.setup.ts so we don't
   * have to pass in a real value.
   */
  setMissionAutomergeDocHandle(null);
});

beforeEach(() => {
  jest.clearAllMocks();
  store = createFullTestStore();
});

afterAll(() => {
  alertSpy.mockRestore();
});

describe("Thunk Action Definition Item Tests", () => {
  test("thunkDeleteActionDefItem - deletion blocked if in use", async () => {
    const missionDocHandle = getAutomergeDocHandles().mission;

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
    store.dispatch(upsertActions([newAction]));

    await store.dispatch(thunkDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      actionDefinitionsCount
    ); // Deletion should be blocked
  });

  test("thunkDeleteActionDefItem - successfully deletes if not in use", async () => {
    const missionDocHandle = getAutomergeDocHandles().mission;

    const actionDefType: ActionDefinitionType = "verbs"; // or other types
    const actionDefUuid = Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType])[0];
    const actionDefinitionsCount = Object.keys(
      missionDocHandle.doc().actionDefinitions[actionDefType]
    ).length;

    await store.dispatch(thunkDeleteActionDefItem({ type: actionDefType, uuid: actionDefUuid }));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(Object.keys(missionDocHandle.doc().actionDefinitions[actionDefType]).length).toBe(
      actionDefinitionsCount - 1
    );
  });
});
