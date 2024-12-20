import { createCustomTestStore } from "../../factories/makeTestStore";
import { initialState as stmInitialState } from "store/stm"; // Assuming you have an initial state for stmRules
import * as thunkStmRules from "store/thunk/thunkStmRules"; // Adjust based on actual paths

// mock all calls to the db so no transactions are actually made but the responses from the db can be simulated
jest.mock("http-client/stm", () => ({
  upsertStmRules: jest.fn().mockImplementation(async (stmRules: STMRule[]) => {
    const response: WrappedResponse<STMRule[]> = {
      data: stmRules,
      status: "success",
      message: "test",
    };
    return Promise.resolve(response);
  }),
  deleteStmRules: jest.fn().mockImplementation(async (stmRuleUuids: string[]) => {
    const response: WrappedResponse<string[]> = {
      data: stmRuleUuids, // Return the list of deleted rule UUIDs
      status: "success",
      message: "Deleted successfully",
    };
    return Promise.resolve(response);
  }),
}));

import * as httpClient_stm from "http-client/stm";
import { generateBlankStmRule } from "store/storeUtils/stm";
import cloneDeep from "lodash/cloneDeep";

beforeEach(() => {
  jest.clearAllMocks(); // clear call count
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("Thunk StmRules Tests", () => {
  test("thunkCreateStmRule()", async () => {
    const store = createCustomTestStore({
      stm: stmInitialState,
    });

    // Dispatch the thunk to create a new rule
    await store.dispatch(thunkStmRules.thunkCreateStmRule({ stmUuid: "test" }));

    // Assertions to check the rule is added to the state
    expect(store.getState().stm.rules).toHaveLength(1);
  });

  test("thunkSaveStmRule()", async () => {
    const newRule = generateBlankStmRule({ stmUuid: "test" });
    const store = createCustomTestStore({
      stm: { ...stmInitialState, rules: [newRule] },
    });

    const updatedRule = { ...newRule, stmUuid: "test2" };

    await store.dispatch(thunkStmRules.thunkSaveStmRule({ stmRule: updatedRule }));

    // Assert that upsertStmRules is called once
    expect(httpClient_stm.upsertStmRules).toHaveBeenCalledTimes(1);
    // Assert that the store is updated with the new rule
    expect(store.getState().stm.rules[0].stmUuid).toEqual("test2");
  });

  test("thunkDeleteStmRule()", async () => {
    const existingRule = generateBlankStmRule({ stmUuid: "test" });
    const store = createCustomTestStore({
      stm: { ...stmInitialState, rules: [existingRule] },
    });

    // Dispatch the thunk to delete the rule
    await store.dispatch(
      thunkStmRules.thunkDeleteStmRuleByUuid({ stmRuleUuid: existingRule.uuid })
    );

    // since this is a new rule, it should not be in the db
    expect(httpClient_stm.deleteStmRules).toHaveBeenCalledTimes(0);
    // Assert that the rule is deleted from the store
    expect(store.getState().stm.rules).toHaveLength(0);
  });

  test("thunkCancelStmRule()", async () => {
    const existingRule = generateBlankStmRule({ stmUuid: "test" });
    existingRule.count = 2;
    const existingRuleFromDb = cloneDeep(existingRule);
    existingRuleFromDb.count = 1;
    const store = createCustomTestStore({
      stm: { ...stmInitialState, rules: [existingRule], rulesFromDb: [existingRuleFromDb] },
    });

    // Dispatch the thunk to cancel the rule
    await store.dispatch(
      thunkStmRules.thunkCancelStmRuleByUuid({ stmRuleUuid: existingRule.uuid })
    );

    // Assert that the rule in the store is the same as the one in the db
    expect(store.getState().stm.rules[0].count).toEqual(1);
  });
});
