import { createTestStoreWithAutomergeMission } from "../../fixtures/store";
import * as thunkStmRules from "store/thunk/thunkStmRules";
import { getMissionDocHandle } from "client/automergeDocHandles";
import { setStmRulesSelectedRuleUuid } from "store/stm";

const getMission = (): Mission => getMissionDocHandle().doc();

afterAll(() => {
  vi.restoreAllMocks();
});

describe("Thunk StmRules Tests", () => {
  test("thunkCreateStmRule() adds a rule to the mission doc and selects it", async () => {
    const store = createTestStoreWithAutomergeMission();
    const level3Uuid = Object.keys(getMission().stmLevel3s)[0];
    const numRules = Object.keys(getMission().stmRules).length;

    await store.dispatch(thunkStmRules.thunkCreateStmRule({ stmUuid: level3Uuid }));

    const rules = Object.values(getMission().stmRules);
    expect(rules).toHaveLength(numRules + 1);
    const selectedRuleUuid = store.getState().stm.stmRulesSelectedRuleUuid;
    expect(getMission().stmRules[selectedRuleUuid]).toMatchObject({
      stmUuid: level3Uuid,
      missionId: getMission().id,
      count: 1,
    });
  });

  test("thunkDeleteStmRuleByUuid() removes the rule and clears the selection", async () => {
    const store = createTestStoreWithAutomergeMission();
    const ruleUuid = Object.keys(getMission().stmRules)[0];
    store.dispatch(setStmRulesSelectedRuleUuid(ruleUuid));

    await store.dispatch(thunkStmRules.thunkDeleteStmRuleByUuid({ stmRuleUuid: ruleUuid }));

    expect(getMission().stmRules[ruleUuid]).toBeUndefined();
    expect(store.getState().stm.stmRulesSelectedRuleUuid).toBeNull();
  });
});
