import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { setAllSliceStores } from "store/crossActions";
import { getAccurateNow } from "utils/formatting";
import { upsertToArrayByUuid } from "store/storeUtils/store";
import { actionTypes } from "store/storeUtils/action";

export const initialState: STMState = {
  level1s: [],
  level2s: [],
  level3s: [],
  rules: [],
  rulesFromDb: [],
  ruleEditingUuid: null,
  stmViewExpandedItems: [],
  stmViewSelectedEvas: [],
  stmViewSelectedActionTypes: [...actionTypes],
  stmViewExpandTopTiers: true,
  stmViewShowCrosshairs: true,
  stmViewHoveredTopItem: null,
  stmViewHoveredLeftItem: null,
  stmRulesSelectedRexes: [],
  stmRulesActiveTab: "rules",
  stmRulesSelectedStmUuid: null,
  stmRulesSelectedRuleUuid: null,
  stmRulesTierExpansion: { level1: true, level2: true },
  stmCoverageBaselineColumnKey: null,
  stmCoverageDiffMode: true,
  stmCoverageDifferencesOnly: false,
  stmCoverageRexStatusFilter: "all",
  stmCoverageHiddenColumns: [],
  stmCoverageExpandedEvaColumns: [],
  stmCoverageHoveredTopItem: null,
  stmCoverageHoveredLeftItem: null,
  stmCoverageDrilldownWidth: 320,
  stmCoverageCellSelection: null,
  stmCoverageVisibleColumns: [],
  stmCoverageCoverageByColumnKey: {},
  stmCoverageResolvedBaselineKey: null,
  stmCoverageSequenceByColumnKey: {},
  stmCoverageVisibleStmUuids: null,
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
              updatedAt: getAccurateNow().toISOString(),
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
            updatedAt: preserveModifiedDate ? null : getAccurateNow().toISOString(),
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
      state.rulesFromDb = state.rulesFromDb.filter((rule) => !action.payload.includes(rule.uuid));
    },
    setRuleEditingUuid: (state, action: { payload: string }) => {
      state.ruleEditingUuid = action.payload;
    },
    stmViewExpandItem: (state, action: { payload: STMViewExpandedItem }) => {
      state.stmViewExpandedItems.push(action.payload);
    },
    stmViewCollapseItem: (state, action: { payload: STMViewExpandedItem }) => {
      const newExpandedItems: STMViewExpandedItem[] = [];
      for (const expandedItem of state.stmViewExpandedItems) {
        if (expandedItem.uuid == action.payload.uuid && expandedItem.type === action.payload.type) {
          continue;
        } else {
          newExpandedItems.push(expandedItem);
        }
      }
      state.stmViewExpandedItems = newExpandedItems;
    },
    stmViewSetExpandedItems: (state, action: { payload: STMViewExpandedItem[] }) => {
      state.stmViewExpandedItems = action.payload;
    },
    stmViewToggleEva: (state, action: { payload: string }) => {
      const index = state.stmViewSelectedEvas.indexOf(action.payload);
      if (index > -1) {
        state.stmViewSelectedEvas.splice(index, 1);
      } else {
        state.stmViewSelectedEvas.push(action.payload);
      }
    },
    stmViewToggleSelectedActionType: (state, action: { payload: ActionType }) => {
      const index = state.stmViewSelectedActionTypes.indexOf(action.payload);
      if (index > -1) {
        state.stmViewSelectedActionTypes.splice(index, 1);
      } else {
        state.stmViewSelectedActionTypes.push(action.payload);
      }
    },
    stmViewToggleExpandTopTiers: (state) => {
      state.stmViewExpandTopTiers = !state.stmViewExpandTopTiers;
    },
    stmViewSetHoveredTopItem: (state, action: { payload: string }) => {
      state.stmViewHoveredTopItem = action.payload;
    },
    stmViewSetHoveredLeftItem: (state, action: { payload: string }) => {
      state.stmViewHoveredLeftItem = action.payload;
    },
    stmViewToggleCrosshairs: (state) => {
      state.stmViewShowCrosshairs = !state.stmViewShowCrosshairs;
    },
    stmRulesToggleRex: (state, action: { payload: string }) => {
      const index = state.stmRulesSelectedRexes.indexOf(action.payload);
      if (index > -1) {
        state.stmRulesSelectedRexes.splice(index, 1);
      } else {
        state.stmRulesSelectedRexes.push(action.payload);
      }
    },
    setStmRulesActiveTab: (state, action: { payload: StmRulesTab }) => {
      state.stmRulesActiveTab = action.payload;
    },
    setStmRulesSelectedStmUuid: (state, action: { payload: string }) => {
      state.stmRulesSelectedStmUuid = action.payload;
    },
    setStmRulesSelectedRuleUuid: (state, action: { payload: string }) => {
      state.stmRulesSelectedRuleUuid = action.payload;
    },
    stmRulesToggleTierExpansion: (state, action: { payload: keyof StmRulesTierExpansion }) => {
      state.stmRulesTierExpansion[action.payload] = !state.stmRulesTierExpansion[action.payload];
    },
    stmCoverageSetBaselineColumnKey: (state, action: { payload: string }) => {
      state.stmCoverageBaselineColumnKey = action.payload;
    },
    stmCoverageToggleDiffMode: (state) => {
      state.stmCoverageDiffMode = !state.stmCoverageDiffMode;
    },
    stmCoverageToggleDifferencesOnly: (state) => {
      state.stmCoverageDifferencesOnly = !state.stmCoverageDifferencesOnly;
    },
    stmCoverageSetRexStatusFilter: (state, action: { payload: RexStatusFilter }) => {
      state.stmCoverageRexStatusFilter = action.payload;
    },
    stmCoverageToggleHiddenColumn: (state, action: { payload: string }) => {
      const index = state.stmCoverageHiddenColumns.indexOf(action.payload);
      if (index > -1) {
        state.stmCoverageHiddenColumns.splice(index, 1);
      } else {
        state.stmCoverageHiddenColumns.push(action.payload);
      }
    },
    // Hide/show several columns atomically (used when toggling an as-planned
    // EVA in the Columns dropdown, which also hides/shows its REX children)
    stmCoverageSetColumnsHidden: (
      state,
      action: { payload: { columnKeys: string[]; hidden: boolean } }
    ) => {
      const { columnKeys, hidden } = action.payload;
      state.stmCoverageHiddenColumns = hidden
        ? [...new Set([...state.stmCoverageHiddenColumns, ...columnKeys])]
        : state.stmCoverageHiddenColumns.filter((key) => !columnKeys.includes(key));
    },
    stmCoverageToggleEvaColumnExpansion: (state, action: { payload: string }) => {
      const index = state.stmCoverageExpandedEvaColumns.indexOf(action.payload);
      if (index > -1) {
        state.stmCoverageExpandedEvaColumns.splice(index, 1);
      } else {
        state.stmCoverageExpandedEvaColumns.push(action.payload);
      }
    },
    stmCoverageSetHoveredTopItem: (state, action: { payload: string }) => {
      state.stmCoverageHoveredTopItem = action.payload;
    },
    stmCoverageSetHoveredLeftItem: (state, action: { payload: string }) => {
      state.stmCoverageHoveredLeftItem = action.payload;
    },
    stmCoverageSetDrilldownWidth: (state, action: { payload: number }) => {
      state.stmCoverageDrilldownWidth = action.payload;
    },
    stmCoverageSetCellSelection: (state, action: { payload: StmCoverageCellSelection }) => {
      state.stmCoverageCellSelection = action.payload;
    },
    stmCoverageSetDerivedData: (state, action: { payload: StmCoverageDerivedData }) => {
      state.stmCoverageVisibleColumns = action.payload.visibleColumns;
      state.stmCoverageCoverageByColumnKey = action.payload.coverageByColumnKey;
      state.stmCoverageResolvedBaselineKey = action.payload.resolvedBaselineKey;
      state.stmCoverageSequenceByColumnKey = action.payload.sequenceByColumnKey;
      state.stmCoverageVisibleStmUuids = action.payload.visibleStmUuids;
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
  stmViewExpandItem,
  stmViewCollapseItem,
  stmViewSetExpandedItems,
  stmViewToggleEva,
  stmViewToggleSelectedActionType,
  stmViewToggleExpandTopTiers,
  stmViewToggleCrosshairs,
  stmViewSetHoveredTopItem,
  stmViewSetHoveredLeftItem,
  stmRulesToggleRex,
  setStmRulesActiveTab,
  setStmRulesSelectedStmUuid,
  setStmRulesSelectedRuleUuid,
  stmRulesToggleTierExpansion,
  stmCoverageSetBaselineColumnKey,
  stmCoverageToggleDiffMode,
  stmCoverageToggleDifferencesOnly,
  stmCoverageSetRexStatusFilter,
  stmCoverageToggleHiddenColumn,
  stmCoverageSetColumnsHidden,
  stmCoverageToggleEvaColumnExpansion,
  stmCoverageSetHoveredTopItem,
  stmCoverageSetHoveredLeftItem,
  stmCoverageSetDrilldownWidth,
  stmCoverageSetCellSelection,
  stmCoverageSetDerivedData,
  obliterateState,
} = stmSlice.actions;
