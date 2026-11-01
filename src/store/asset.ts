import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "./crossActions";

export const initialState: AssetState = {
  selectedAssetUuid: null,
  expandedAssetUuid: null,
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
    setExpandedAssetUuid: (state, action: { payload: string | null }) => {
      state.expandedAssetUuid = action.payload;
    },
    openAssetDraft: (state, action: { payload: AssetDraft }) => {
      state.draft = action.payload;
      state.expandedAssetUuid = action.payload.isNew ? null : action.payload.uuid;
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
        };
      }
    ) => {
      const { uuid, location, placement, elevationPending } = action.payload;
      if (state.draft?.uuid !== uuid) return;
      state.draft.values.location = { lat: location.lat, lng: location.lng };
      state.draft.values.placement = placement;
      state.draft.values.elevation = null;
      state.draft.elevationPending = elevationPending;
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
    clearAssetDraft: (state) => {
      if (state.draft && !state.draft.isNew && state.expandedAssetUuid === state.draft.uuid) {
        state.expandedAssetUuid = null;
      }
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
  setExpandedAssetUuid,
  openAssetDraft,
  updateAssetDraftValues,
  setAssetDraftLocation,
  setAssetDraftElevation,
  clearAssetDraft,
  requestAssetsTab,
  obliterateState,
} = assetSlice.actions;

export default assetSlice.reducer;
