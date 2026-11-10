import { createSlice } from "@reduxjs/toolkit";
import { setAllSliceStores } from "store/crossActions";

export const initialState: RexState = {
  selectedRexUuid: null,
  selectedPosEntryUuid: null,
  expandedPosEntryUuid: null,
  posEntryInEdit: null,
};

export const rexSlice = createSlice({
  name: "rex",
  initialState,
  reducers: {
    setSelectedRexUuid: (state, action: { payload: string }) => {
      state.selectedRexUuid = action.payload;
      state.selectedPosEntryUuid = null;
      state.expandedPosEntryUuid = null;
    },
    setSelectedPosEntryUuid: (state, action: { payload: string }) => {
      state.selectedPosEntryUuid = action.payload;
    },
    setExpandedPosEntryUuid: (state, action: { payload: string | null }) => {
      state.expandedPosEntryUuid = action.payload;
    },
    /** Open an Add or Edit session; an edited entry's row expands, a new one has no row. */
    setPosEntryInEdit: (state, action: { payload: PosEntryInEdit }) => {
      state.posEntryInEdit = action.payload;
      state.expandedPosEntryUuid = action.payload.isNew ? null : action.payload.uuid;
    },
    /** Update edited fields; location and elevation are managed separately. */
    updatePosEntryInEditValues: (
      state,
      action: { payload: Partial<Omit<PosEntryEditValues, "location" | "elevation">> }
    ) => {
      if (!state.posEntryInEdit) return;
      state.posEntryInEdit.values = { ...state.posEntryInEdit.values, ...action.payload };
    },
    /** Accept or clear an in-edit location. */
    setPosEntryInEditLocation: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint | null; elevationPending: boolean } }
    ) => {
      const { uuid, location, elevationPending } = action.payload;
      if (state.posEntryInEdit?.uuid !== uuid) return;
      state.posEntryInEdit.values.location = location
        ? { lat: location.lat, lng: location.lng }
        : null;
      state.posEntryInEdit.values.elevation = null;
      state.posEntryInEdit.elevationPending = elevationPending;
    },
    /** Store a fetched elevation, discarding it if the entry has moved since the fetch began. */
    setPosEntryInEditElevation: (
      state,
      action: { payload: { uuid: string; location: AEGISPoint; elevation: number | null } }
    ) => {
      const { uuid, location, elevation } = action.payload;
      if (state.posEntryInEdit?.uuid !== uuid) return;
      const current = state.posEntryInEdit.values.location;
      if (!current || current.lat !== location.lat || current.lng !== location.lng) return;
      state.posEntryInEdit.values.elevation = elevation;
      state.posEntryInEdit.elevationPending = false;
    },
    clearPosEntryInEdit: (state, action: { payload: { keepExpanded: boolean } | undefined }) => {
      const inEdit = state.posEntryInEdit;
      if (
        !action.payload?.keepExpanded &&
        inEdit &&
        !inEdit.isNew &&
        state.expandedPosEntryUuid === inEdit.uuid
      ) {
        state.expandedPosEntryUuid = null;
      }
      state.posEntryInEdit = null;
    },
    obliterateState: (state) => {
      //eslint-disable-next-line
      state = Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setAllSliceStores, (state, action: { payload: WholeStoreState }) => {
      state = Object.assign(state, action.payload.rex);
    });
  },
});

export const {
  setSelectedRexUuid,
  setSelectedPosEntryUuid,
  setExpandedPosEntryUuid,
  setPosEntryInEdit,
  updatePosEntryInEditValues,
  setPosEntryInEditLocation,
  setPosEntryInEditElevation,
  clearPosEntryInEdit,
  obliterateState,
} = rexSlice.actions;
