import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "./crossActions";

export const initialState: AssetState = {
  selectedAssetUuid: null,
  expandedAssetUuid: null,
  inEdit: null,
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
    /** Open an Add or Edit session; an edited asset's row expands, a new one has no row. */
    setAssetInEdit: (state, action: { payload: AssetInEdit }) => {
      state.inEdit = action.payload;
      state.expandedAssetUuid = action.payload.isNew ? null : action.payload.uuid;
    },
    /** Update editable metadata; location/elevation and PET source are managed separately. */
    updateAssetInEditValues: (
      state,
      action: {
        payload: Partial<Omit<AssetEditValues, "location" | "elevation" | "petRex">>;
      }
    ) => {
      if (!state.inEdit) return;
      if (
        "petSeconds" in action.payload &&
        action.payload.petSeconds !== state.inEdit.values.petSeconds
      ) {
        state.inEdit.values.petRex = null;
      }
      state.inEdit.values = { ...state.inEdit.values, ...action.payload };
    },
    /** Capture a PET value together with the REX that supplied it. */
    setAssetInEditPet: (
      state,
      action: { payload: Pick<AssetEditValues, "petSeconds" | "petRex"> }
    ) => {
      if (!state.inEdit) return;
      state.inEdit.values.petSeconds = action.payload.petSeconds;
      state.inEdit.values.petRex = action.payload.petRex;
    },
    /** Accept or clear an in-edit location. */
    setAssetInEditLocation: (
      state,
      action: {
        payload: {
          uuid: string;
          location: AEGISPoint | null;
          elevationPending: boolean;
        };
      }
    ) => {
      const { uuid, location, elevationPending } = action.payload;
      if (state.inEdit?.uuid !== uuid) return;
      state.inEdit.values.location = location ? { lat: location.lat, lng: location.lng } : null;
      state.inEdit.values.elevation = null;
      state.inEdit.elevationPending = elevationPending;
    },
    /** Store a fetched elevation, discarding it if the asset has moved since the fetch began. */
    setAssetInEditElevation: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint; elevation: number | null } }
    ) => {
      const { uuid, location, elevation } = action.payload;
      if (state.inEdit?.uuid !== uuid) return;
      const current = state.inEdit.values.location;
      if (!current || current.lat !== location.lat || current.lng !== location.lng) return;
      state.inEdit.values.elevation = elevation;
      state.inEdit.elevationPending = false;
    },
    clearAssetInEdit: (state, action: { payload: { keepExpanded: boolean } | undefined }) => {
      if (
        !action.payload?.keepExpanded &&
        state.inEdit &&
        !state.inEdit.isNew &&
        state.expandedAssetUuid === state.inEdit.uuid
      ) {
        state.expandedAssetUuid = null;
      }
      state.inEdit = null;
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
  setAssetInEdit,
  updateAssetInEditValues,
  setAssetInEditPet,
  setAssetInEditLocation,
  setAssetInEditElevation,
  clearAssetInEdit,
  requestAssetsTab,
  obliterateState,
} = assetSlice.actions;

export default assetSlice.reducer;
