import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";
import { actionTypes } from "store/storeUtils/action";

export const initialState: STMState = {
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
};

export const stmSlice = createSlice({
  name: "stm",
  initialState,
  reducers: {
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
    stmViewSetHoveredTopItem: (state, action: { payload: string | null }) => {
      state.stmViewHoveredTopItem = action.payload;
    },
    stmViewSetHoveredLeftItem: (state, action: { payload: string | null }) => {
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
    setStmRulesSelectedStmUuid: (state, action: { payload: string | null }) => {
      state.stmRulesSelectedStmUuid = action.payload;
    },
    setStmRulesSelectedRuleUuid: (state, action: { payload: string | null }) => {
      state.stmRulesSelectedRuleUuid = action.payload;
    },
    stmRulesToggleTierExpansion: (state, action: { payload: keyof StmRulesTierExpansion }) => {
      state.stmRulesTierExpansion[action.payload] = !state.stmRulesTierExpansion[action.payload];
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
  obliterateState,
} = stmSlice.actions;
