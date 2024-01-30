import { createSlice } from "@reduxjs/toolkit";
import { cloneDeep } from "lodash";

import { getAccurateNow, roundDateToSecond } from "utils/formatting";
import { upsertToArrayByUuid } from "utils/store";

export const initialState: RexState = {
  rexes: [],
  rexesFromDb: [],
  selectedRexUuid: null,
  expandedRexUuids: [],
  selectedRexRightNavItem: "info_panel",
  rexesEditing: [],
  rexesPosEntriesEditing: [],
  selectedPosEntryUuid: null,
  posEntryEditingUuid: null,
  loadingStatus: "unloaded",
};

export const rexSlice = createSlice({
  name: "rex",
  initialState,
  reducers: {
    upsertRex: {
      prepare: (rex: Rex, preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: rex };
        } else {
          return {
            payload: { ...rex, updatedAt: roundDateToSecond(getAccurateNow()).toISOString() },
          };
        }
      },
      reducer: (state, action: { payload: Rex }) => {
        upsertToArrayByUuid(state.rexes, action.payload);
      },
    },
    upsertRexes: {
      prepare: (rexes: Rex[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: rexes };
        } else {
          return {
            payload: rexes.map((rex) => ({
              ...rex,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: Rex[] }) => {
        action.payload.forEach((rex) => upsertToArrayByUuid(state.rexes, rex));
      },
    },
    upsertRexFromDb: (state, action: { payload: Rex }) => {
      upsertToArrayByUuid(state.rexesFromDb, action.payload);
    },
    upsertRexesFromDb: (state, action: { payload: Rex[] }) => {
      action.payload.forEach((rex) => upsertToArrayByUuid(state.rexesFromDb, rex));
    },
    upsertRexByField: {
      prepare: (
        rexUuid: string,
        fieldName: keyof Rex,
        value: Rex[keyof Rex],
        preserveModifiedDate: boolean = false
      ) => {
        if (preserveModifiedDate) {
          return {
            payload: { rexUuid, fieldName, value, updatedAt: null },
          };
        } else {
          return {
            payload: {
              rexUuid,
              fieldName,
              value,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: {
          payload: {
            rexUuid: string;
            fieldName: keyof Rex;
            value: Rex[keyof Rex];
            updatedAt: string;
          };
        }
      ) => {
        const rex = state.rexes.find((s) => s.uuid === action.payload.rexUuid);
        const newRex: Rex = cloneDeep(rex);
        newRex.updatedAt = action.payload.updatedAt || rex.updatedAt;
        const key = action.payload.fieldName;
        (newRex as Record<typeof key, Rex[keyof Rex]>)[key] = action.payload.value;
        upsertToArrayByUuid(state.rexes, newRex);
      },
    },
    /* only called for populating store  */
    setRexes: (state, action: { payload: Rex[] }) => {
      state.rexes = action.payload;
    },
    setRexesFromDb: (state, action: { payload: Rex[] }) => {
      state.rexesFromDb = action.payload;
    },
    deleteRexByUuid: (state, action: { payload: string }) => {
      state.rexes = state.rexes.filter((rex) => rex.uuid !== action.payload);
    },
    deleteRexFromDbByUuid: (state, action: { payload: string }) => {
      state.rexesFromDb = state.rexesFromDb.filter((rex) => rex.uuid !== action.payload);
    },
    deleteRexesByUuid: (state, action: { payload: string[] }) => {
      state.rexes = state.rexes.filter((rex) => !action.payload.includes(rex.uuid));
    },
    deleteRexesFromDbByUuid: (state, action: { payload: string[] }) => {
      state.rexesFromDb = state.rexesFromDb.filter((rex) => !action.payload.includes(rex.uuid));
    },
    setSelectedRexUuid: (state, action: { payload: string }) => {
      state.selectedRexUuid = action.payload;
      state.selectedPosEntryUuid = null;
    },
    setExpandedRexUuids: (state, action: { payload: string[] }) => {
      state.expandedRexUuids = action.payload;
    },
    setSelectedRexRightNavItem: (state, action: { payload: string }) => {
      state.selectedRexRightNavItem = action.payload;
    },
    setRexesEditing: (state, action: { payload: string[] }) => {
      state.rexesEditing = action.payload;
    },
    setRexEditMode: (state, action: { payload: { rexUuid: string; editMode: boolean } }) => {
      if (action.payload.editMode) {
        state.rexesEditing.push(action.payload.rexUuid);
      } else {
        state.rexesEditing = state.rexesEditing.filter((uuid) => uuid !== action.payload.rexUuid);
      }
    },
    setRexesPosEntryEditMode: (
      state,
      action: { payload: { rexUuid: string; editMode: boolean } }
    ) => {
      if (action.payload.editMode) {
        state.rexesPosEntriesEditing.push(action.payload.rexUuid);
      } else {
        state.rexesPosEntriesEditing = state.rexesPosEntriesEditing.filter(
          (uuid) => uuid !== action.payload.rexUuid
        );
      }
    },
    setStateForNewRex: (state, action: { payload: { rexUuid: string } }) => {
      state.rexesEditing.push(action.payload.rexUuid);
      state.selectedRexUuid = action.payload.rexUuid;
      state.expandedRexUuids.push(action.payload.rexUuid);
      state.selectedRexRightNavItem = "info_panel";
    },
    setSelectedPosEntryUuid: (state, action: { payload: string }) => {
      state.selectedPosEntryUuid = action.payload;
    },
    setPosEntryEditingUuid: (state, action: { payload: string }) => {
      state.posEntryEditingUuid = action.payload;
    },
    upsertPosEntry: {
      prepare: ({
        rexUuid,
        posEntry: posEntry,
        preserveModifiedDate = false,
      }: {
        rexUuid: string;
        posEntry: PosEntry;
        preserveModifiedDate?: boolean;
      }) => {
        if (preserveModifiedDate) {
          return {
            payload: { rexUuid, posEntry, updatedAt: null },
          };
        } else {
          return {
            payload: {
              rexUuid,
              posEntry,
              updatedAt: roundDateToSecond(getAccurateNow()).toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: { payload: { rexUuid: string; posEntry: PosEntry; updatedAt: string } }
      ) => {
        const rex = state.rexes.find((f) => f.uuid === action.payload.rexUuid);
        if (!rex.posEntries) {
          rex.posEntries = [{ ...action.payload.posEntry, updatedAt: action.payload.updatedAt }];
        } else {
          upsertToArrayByUuid(rex.posEntries, {
            ...action.payload.posEntry,
            updatedAt: action.payload.updatedAt,
          });
        }
        if (action.payload.updatedAt) rex.updatedAt = action.payload.updatedAt;
      },
    },
    deletePosEntryByUuid: (
      state,
      action: { payload: { rexUuid: string; posEntryUuid: string } }
    ) => {
      const rex = state.rexes.find((f) => f.uuid === action.payload.rexUuid);
      rex.posEntries = rex.posEntries.filter((c) => c.uuid !== action.payload.posEntryUuid);
    },
    setRexLoadingStatus: (state, action: { payload: LoadingStatus }) => {
      state.loadingStatus = action.payload;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
});

export const {
  setRexes,
  setRexesFromDb,
  upsertRex,
  upsertRexFromDb,
  upsertRexes,
  upsertRexesFromDb,
  upsertRexByField,
  deleteRexByUuid,
  deleteRexFromDbByUuid,
  deleteRexesByUuid,
  deleteRexesFromDbByUuid,
  setSelectedRexUuid,
  setExpandedRexUuids,
  setSelectedRexRightNavItem,
  setRexesEditing,
  setRexEditMode,
  setRexesPosEntryEditMode,
  setStateForNewRex,
  setSelectedPosEntryUuid,
  setPosEntryEditingUuid,
  upsertPosEntry,
  deletePosEntryByUuid,
  setRexLoadingStatus,
  obliterateState,
} = rexSlice.actions;
