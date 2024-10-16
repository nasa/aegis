import { createSlice } from "@reduxjs/toolkit";
import { cloneDeep } from "lodash";
import { setAllSliceStores } from "store/crossActions";
import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: STMState = {
  level1s: [],
  level2s: [],
  level3s: [],
  rules: [],
  rulesFromDb: [],
  ruleEditingUuid: null,
};

export const stmSlice = createSlice({
  name: "stm",
  initialState,
  reducers: {
    upsertSTMRules: {
      prepare: (rules: STMRule[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: rules };
        } else {
          return {
            payload: rules.map((rule) => ({
              ...rule,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: STMRule[] }) => {
        action.payload.forEach((rule) => upsertToArrayByUuid(state.rules, rule));
      },
    },
    upsertSTMRulesFromDb: (state, action: { payload: STMRule[] }) => {
      action.payload.forEach((rule) => upsertToArrayByUuid(state.rulesFromDb, rule));
    },
    upsertSTMRuleByField: {
      prepare: (
        ruleUuid: string,
        fieldName: keyof STMRule,
        value: STMRule[keyof STMRule],
        preserveModifiedDate: boolean = false
      ) => {
        return {
          payload: {
            ruleUuid,
            fieldName,
            value,
            updatedAt: preserveModifiedDate
              ? null
              : roundDateToSecond(getAccurateNow()).toISOString(),
          },
        };
      },
      reducer: (
        state,
        action: {
          payload: {
            ruleUuid: string;
            fieldName: keyof STMRule;
            value: STMRule[keyof STMRule];
            updatedAt: string;
          };
        }
      ) => {
        const rule = state.rules.find((s) => s.uuid === action.payload.ruleUuid);
        const newRule: STMRule = cloneDeep(rule);
        newRule.updatedAt = action.payload.updatedAt || rule.updatedAt;
        const key = action.payload.fieldName;
        (newRule as Record<typeof key, Action[keyof Action]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.rules, newRule);
      },
    },
    deleteSTMRules: (state, action: { payload: string[] }) => {
      state.rules = state.rules.filter((rule) => !action.payload.includes(rule.uuid));
    },
    deleteSTMRulesFromDb: (state, action: { payload: string[] }) => {
      state.rules = state.rulesFromDb.filter((rule) => !action.payload.includes(rule.uuid));
    },
    setRuleEditingUuid: (state, action: { payload: string }) => {
      state.ruleEditingUuid = action.payload;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.stm);
    });
  },
});

export const {
  upsertSTMRules,
  upsertSTMRulesFromDb,
  upsertSTMRuleByField,
  deleteSTMRules,
  deleteSTMRulesFromDb,
  setRuleEditingUuid,
  obliterateState,
} = stmSlice.actions;
