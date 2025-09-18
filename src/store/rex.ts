import { createSlice } from "@reduxjs/toolkit";
import cloneDeep from "lodash/cloneDeep";
import { setAllSliceStores } from "store/crossActions";

import { getAccurateNow } from "utils/formatting";
import { upsertToArrayByUuid } from "store/storeUtils/store";

export const initialState: RexState = {
  rexes: [],
  rexesFromDb: [],
  selectedRexUuid: null,
  selectedPosEntryUuid: null,
  posEntryInEdit: null,
};

export const rexSlice = createSlice({
  name: "rex",
  initialState,
  reducers: {
    upsertRexes: {
      prepare: (rexes: Rex[], preserveModifiedDate: boolean = false) => {
        if (preserveModifiedDate) {
          return { payload: rexes };
        } else {
          return {
            payload: rexes.map((rex) => ({
              ...rex,
              updatedAt: getAccurateNow().toISOString(),
            })),
          };
        }
      },
      reducer: (state, action: { payload: Rex[] }) => {
        action.payload.forEach((rex) => upsertToArrayByUuid(state.rexes, rex));
      },
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
              updatedAt: getAccurateNow().toISOString(),
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
    setSelectedPosEntryUuid: (state, action: { payload: string }) => {
      state.selectedPosEntryUuid = action.payload;
    },
    setPosEntryInEdit: (state, action: { payload: PosEntry | null }) => {
      state.posEntryInEdit = action.payload;
    },
    clearPosEntryInEdit: (state) => {
      // clear everything but the posTypes and the posSource
      state.posEntryInEdit = {
        ...state.posEntryInEdit,
        uuid: null,
        location: null,
        elevation: null,
        petSeconds: null,
        createdAt: null,
        updatedAt: null,
      };
    },
    upsertPosEntries: {
      prepare: ({
        rexUuid,
        posEntries,
        preserveModifiedDate = false,
      }: {
        rexUuid: string;
        posEntries: PosEntry[];
        preserveModifiedDate?: boolean;
      }) => {
        if (preserveModifiedDate) {
          return {
            payload: { rexUuid, posEntries, updatedAt: null },
          };
        } else {
          return {
            payload: {
              rexUuid,
              posEntries,
              updatedAt: getAccurateNow().toISOString(),
            },
          };
        }
      },
      reducer: (
        state,
        action: { payload: { rexUuid: string; posEntries: PosEntry[]; updatedAt: string } }
      ) => {
        const { rexUuid, posEntries, updatedAt } = action.payload;
        const rex = state.rexes.find((f) => f.uuid === rexUuid);
        if (!rex.posEntries) {
          rex.posEntries = posEntries.map((entry) => ({
            ...entry,
            updatedAt,
          }));
        } else {
          posEntries.forEach((entry) => {
            upsertToArrayByUuid(rex.posEntries, {
              ...entry,
              updatedAt,
            });
          });
        }
        if (updatedAt) rex.updatedAt = updatedAt;
      },
    },
    deletePosEntryByUuid: (
      state,
      action: { payload: { rexUuid: string; posEntryUuid: string } }
    ) => {
      const rex = state.rexes.find((f) => f.uuid === action.payload.rexUuid);
      rex.posEntries = rex.posEntries.filter((c) => c.uuid !== action.payload.posEntryUuid);
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.rex);
    });
  },
});

export const {
  upsertRexes,
  upsertRexesFromDb,
  upsertRexByField,
  deleteRexesByUuid,
  deleteRexesFromDbByUuid,
  setSelectedRexUuid,
  setSelectedPosEntryUuid,
  setPosEntryInEdit,
  clearPosEntryInEdit,
  upsertPosEntries,
  deletePosEntryByUuid,
  obliterateState,
} = rexSlice.actions;
