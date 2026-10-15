import { generateBlankStmRule } from "store/storeUtils/stm";
import appCreateAsyncThunk from "./thunkUtil";
import { setStmRulesSelectedRuleUuid } from "store/stm";
import { getMissionDocHandle, withMissionChange } from "client/automergeDocHandles";
import { applyDeleteStmRule, applyUpsertStmRule } from "operations/apply/apply-mission-stm";

export const thunkCreateStmRule = appCreateAsyncThunk<{ stmUuid: string }>(
  "stmRuleCreate",
  async ({ stmUuid }, { dispatch }) => {
    const mission = getMissionDocHandle()?.doc();
    if (!mission) return;
    const newRule: STMRule = { ...generateBlankStmRule({ stmUuid }), missionId: mission.id };
    withMissionChange((m) => applyUpsertStmRule(m, newRule));
    dispatch(setStmRulesSelectedRuleUuid(newRule.uuid));
  }
);

export const thunkDeleteStmRuleByUuid = appCreateAsyncThunk<{ stmRuleUuid: string }>(
  "stmRuleDelete",
  async ({ stmRuleUuid }, { dispatch, getState }) => {
    withMissionChange((m) => applyDeleteStmRule(m, stmRuleUuid));
    if (getState().stm.stmRulesSelectedRuleUuid === stmRuleUuid) {
      dispatch(setStmRulesSelectedRuleUuid(null));
    }
  }
);
