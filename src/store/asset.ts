import { createSlice } from "@reduxjs/toolkit";
import isEqual from "lodash/isEqual";
import { setAllSliceStores } from "./crossActions";

export const initialState: AssetState = {
  selectedAssetUuid: null,
  draft: null,
  assetsTabRequestId: 0,
};

export const assetSlice = createSlice({
  name: "asset",
  initialState,
  reducers: {
    setSelectedAssetUuid: (state, action: { payload: string | null }) => {
      state.selectedAssetUuid = action.payload;
    },
    openAssetDraft: (state, action: { payload: AssetDraft }) => {
      state.draft = action.payload;
    },
    /** Update draft fields other than location, elevation, and placement. */
    updateAssetDraftValues: (
      state,
      action: {
        payload: Partial<Omit<AssetDraftValues, "location" | "elevation" | "placement">>;
      }
    ) => {
      if (!state.draft) return;
      state.draft.values = { ...state.draft.values, ...action.payload };
    },
    /** Accept a new draft location together with its freshly captured placement context. */
    setAssetDraftLocation: (
      state,
      action: {
        payload: {
          uuid: string;
          location: AEGISPoint;
          placement: AssetPlacementContext;
          elevationPending: boolean;
          message: string | null;
        };
      }
    ) => {
      const { uuid, location, placement, elevationPending, message } = action.payload;
      if (state.draft?.uuid !== uuid) return;
      state.draft.values.location = { lat: location.lat, lng: location.lng };
      state.draft.values.placement = placement;
      state.draft.values.elevation = null;
      state.draft.elevationPending = elevationPending;
      state.draft.message = message;
    },
    /** Store a fetched elevation, discarding it if the draft has moved since the fetch began. */
    setAssetDraftElevation: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint; elevation: number | null } }
    ) => {
      const { uuid, location, elevation } = action.payload;
      if (state.draft?.uuid !== uuid) return;
      const current = state.draft.values.location;
      if (!current || current.lat !== location.lat || current.lng !== location.lng) return;
      state.draft.values.elevation = elevation;
      state.draft.elevationPending = false;
    },
    setAssetDraftMessage: (state, action: { payload: string | null }) => {
      if (!state.draft) return;
      state.draft.message = action.payload;
    },
    /** Rebase a draft on the current document values after a conflicting change. */
    rebaseAssetDraft: (
      state,
      action: {
        payload: { base: AssetDraftValues; values: AssetDraftValues; message: string | null };
      }
    ) => {
      if (!state.draft) return;
      if (!isEqual(state.draft.base, action.payload.base)) state.draft.base = action.payload.base;
      if (!isEqual(state.draft.values, action.payload.values)) {
        state.draft.values = action.payload.values;
      }
      state.draft.message = action.payload.message;
    },
    clearAssetDraft: (state) => {
      state.draft = null;
    },
    requestAssetsTab: (state) => {
      state.assetsTabRequestId += 1;
    },
    obliterateState: (state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // reducer called across slices. This handles this slice's portion of the reducer's state
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.asset);
    });
  },
});

export const {
  setSelectedAssetUuid,
  openAssetDraft,
  updateAssetDraftValues,
  setAssetDraftLocation,
  setAssetDraftElevation,
  setAssetDraftMessage,
  rebaseAssetDraft,
  clearAssetDraft,
  requestAssetsTab,
  obliterateState,
} = assetSlice.actions;

export default assetSlice.reducer;
