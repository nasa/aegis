import { generateBlankStmRule } from "store/storeUtils/stm";
import appCreateAsyncThunk from "./thunkUtil";
import {
  deleteSTMRules,
  deleteSTMRulesFromDb,
  setRuleEditingUuid,
  upsertSTMRules,
  upsertSTMRulesFromDb,
} from "store/stm";
import * as httpClient_stm from "http-client/stm";
import { getAccurateNow } from "utils/formatting";

export const thunkCreateStmRule = appCreateAsyncThunk<{ stmUuid: string }>(
  "stmRuleCreate",
  async ({ stmUuid }, { dispatch }) => {
    const newRule = generateBlankStmRule({ stmUuid });
    await dispatch(thunkSaveStmRule({ stmRule: newRule }));
    // a freshly created rule is blank — put it straight into inline edit mode
    dispatch(setRuleEditingUuid(newRule.uuid));
  }
);

export const thunkSaveStmRule = appCreateAsyncThunk<{ stmRule: STMRule }>(
  "saveStmRule",
  async ({ stmRule }, { dispatch }) => {
    //save poi to db
    const stmRuleUpsertResponse = await httpClient_stm.upsertStmRules([
      {
        ...stmRule,
        updatedAt: getAccurateNow().toISOString(),
      },
    ]);

    // upsert rule to store
    dispatch(upsertSTMRules([stmRuleUpsertResponse.data[0]], true));
    // upsert rules to db copy in the store
    dispatch(upsertSTMRulesFromDb([stmRuleUpsertResponse.data[0]]));

    dispatch(setRuleEditingUuid(null));
  }
);

export const thunkDeleteStmRuleByUuid = appCreateAsyncThunk<{ stmRuleUuid: string }>(
  "stmRuleDelete",
  async ({ stmRuleUuid }, { dispatch, getState }) => {
    const rule = getState().stm.rules.find((rule) => rule.uuid === stmRuleUuid);
    if (rule) {
      // delete rule from store
      dispatch(deleteSTMRules([stmRuleUuid]));
    }
    const ruleInDb = getState().stm.rulesFromDb.find((rule) => rule.uuid === stmRuleUuid);
    if (ruleInDb) {
      // delete rule from db
      await httpClient_stm.deleteStmRules([stmRuleUuid]);
      // delete rule from store db copy
      dispatch(deleteSTMRulesFromDb([stmRuleUuid]));
    }
    dispatch(setRuleEditingUuid(null));
  }
);

export const thunkCancelStmRuleByUuid = appCreateAsyncThunk<{ stmRuleUuid: string }>(
  "stmRuleCancel",
  async ({ stmRuleUuid }, { dispatch, getState }) => {
    const rule = getState().stm.rulesFromDb.find((rule) => rule.uuid === stmRuleUuid);
    if (rule) {
      dispatch(upsertSTMRules([rule], true));
    }
    dispatch(setRuleEditingUuid(null));
  }
);
