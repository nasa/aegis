import { v4 as uuidv4 } from "uuid";
import isEqual from "lodash/isEqual";

import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  clearAssetDraft,
  openAssetDraft,
  rebaseAssetDraft,
  requestAssetsTab,
  setAssetDraftElevation,
  setAssetDraftLocation,
  setAssetDraftMessage,
  setSelectedAssetUuid,
} from "store/asset";
import { setHoverAssetUuid } from "store/hover";
import { getFolderInterface, setRexMenuIsMinimized } from "store/interface";
import { updateMapDirective } from "store/map";
import { isConnected } from "store/selectors";
import { generateBlankAsset } from "store/storeUtils/asset";
import { thunkToggleFolderOpen } from "./thunkFolder";
import { cancelPendingMapDirective, thunkUpdateMapDirective } from "./thunkMap";
import { thunkFetchPointElevation } from "./thunkTerrainProfile";
import {
  applyCreateAsset,
  applyDeleteAsset,
  applyMoveAssetToFolder,
  applyToggleAssetVisible,
  applyUpdateAsset,
} from "operations/apply/apply-asset";
import {
  captureAssetPlacement,
  getAssetDraftValues,
  getAssetFolderUuidByItem,
  getChangedAssetFields,
  getMostRecentAsset,
  mergeAssetDraftWithDocument,
  validateAssetDraftValues,
} from "utils/assets";
import { getAccurateNow } from "utils/formatting";

const AMBIGUOUS_PLACEMENT_MESSAGE =
  "More than one REX is running, so no REX or PET context was recorded for this placement.";

const FIELD_LABELS: Record<keyof AssetDraftValues, string> = {
  name: "name",
  icon: "emoji",
  color: "color",
  location: "location",
  elevation: "location",
  uncertaintyMeters: "uncertainty",
  notes: "notes",
  placement: "location",
};

// Elevation fetches still in flight, keyed by asset uuid. Save waits for them to settle.
const pendingElevationFetches = new Map<string, Promise<void>>();

/** End an active or scheduled asset map gesture without touching the draft. */
export const thunkCancelAssetGesture = appCreateAsyncThunk<void>(
  "asset/cancelGesture",
  async (__, { dispatch, getState }) => {
    cancelPendingMapDirective();
    if (getState().map.mapDirective?.mapItemType === "asset") {
      dispatch(updateMapDirective(null));
    }
  }
);

/** Open a new asset draft prefilled from the most recently created asset. */
export const thunkOpenNewAssetDraft = appCreateAsyncThunk<void>(
  "asset/openNewDraft",
  async (__, { dispatch, getState }) => {
    if (getState().asset.draft) return;
    const mission = getMissionDocHandle()?.doc();
    if (!mission) return;
    const latest = getMostRecentAsset(Object.values(mission.assets ?? {}));
    const uuid = uuidv4();
    dispatch(setSelectedAssetUuid(uuid));
    dispatch(
      openAssetDraft({
        uuid,
        isNew: true,
        missionId: mission.id,
        values: {
          name: latest?.name ?? "",
          icon: latest?.icon ?? null,
          color: null,
          location: null,
          elevation: null,
          uncertaintyMeters: 0,
          notes: null,
          placement: null,
        },
        base: null,
        elevationPending: false,
        message: null,
      })
    );
  }
);

/** Open the editor on an existing asset. Selects it first so a gesture keys on it. */
export const thunkOpenAssetDraftForEdit = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/openEditDraft",
  async ({ assetUuid }, { dispatch }) => {
    const mission = getMissionDocHandle()?.doc();
    const asset = mission?.assets?.[assetUuid];
    if (!asset) return;
    await dispatch(thunkCancelAssetGesture());
    const values = getAssetDraftValues(asset);
    dispatch(setSelectedAssetUuid(assetUuid));
    dispatch(
      openAssetDraft({
        uuid: assetUuid,
        isNew: false,
        missionId: mission.id,
        values,
        base: getAssetDraftValues(asset),
        elevationPending: false,
        message: null,
      })
    );
  }
);

/** Discard the draft and any gesture. Nothing was written, so nothing is rolled back. */
export const thunkCancelAssetDraft = appCreateAsyncThunk<void>(
  "asset/cancelDraft",
  async (__, { dispatch }) => {
    await dispatch(thunkCancelAssetGesture());
    dispatch(clearAssetDraft());
  }
);

/** Start Place on Map (unplaced draft) or Edit Pos. (placed draft) for the open draft. */
export const thunkStartAssetGesture = appCreateAsyncThunk<void>(
  "asset/startGesture",
  async (__, { dispatch, getState }) => {
    const state = getState();
    const draft = state.asset.draft;
    if (!draft || !state.user.missionPerms?.permissions.edit) return;
    await dispatch(
      thunkUpdateMapDirective({
        mapItemType: "asset",
        uuid: draft.uuid,
        mapAction: draft.values.location ? "editMarker" : "createMarker",
      })
    );
  }
);

/**
 * Accept a new draft location from a map click, a completed drag, or coordinate entry:
 * capture placement context at this instant and fetch the elevation. The document is not
 * touched until Save.
 */
export const thunkSetAssetDraftLocation = appCreateAsyncThunk<{
  uuid: string;
  location: AEGISPoint;
}>("asset/setDraftLocation", async ({ uuid, location }, { dispatch, getState }) => {
  const draft = getState().asset.draft;
  if (!draft || draft.uuid !== uuid) return;
  const mission = getMissionDocHandle()?.doc();
  if (!mission || mission.id !== draft.missionId) return;
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return;

  const point = { lat: location.lat, lng: location.lng };
  const { placement, ambiguous } = captureAssetPlacement(mission, getAccurateNow().getTime());
  const hasDem = !!mission.demFilePath;
  dispatch(
    setAssetDraftLocation({
      uuid,
      location: point,
      placement,
      elevationPending: hasDem,
      message: ambiguous ? AMBIGUOUS_PLACEMENT_MESSAGE : null,
    })
  );
  if (!hasDem) return;

  const fetchElevation = (async () => {
    const result = await dispatch(thunkFetchPointElevation({ point, uuid }));
    const elevation =
      result.meta.requestStatus === "fulfilled" ? ((result.payload as number) ?? null) : null;
    // A draft from another mission must not receive this result.
    if (getState().asset.draft?.missionId !== mission.id) return;
    dispatch(setAssetDraftElevation({ uuid, location: point, elevation }));
  })();
  pendingElevationFetches.set(uuid, fetchElevation);
  try {
    await fetchElevation;
  } finally {
    if (pendingElevationFetches.get(uuid) === fetchElevation) pendingElevationFetches.delete(uuid);
  }
});

/**
 * Save the open draft in one document change. Keeps the draft with a message when the save
 * cannot proceed (permission, connection, mission, validation, or a conflicting change).
 * @returns true when saved.
 */
export const thunkSaveAssetDraft = appCreateAsyncThunk<void, boolean>(
  "asset/saveDraft",
  async (__, { dispatch, getState }) => {
    const uuid = getState().asset.draft?.uuid;
    if (!uuid) return false;

    // Wait for the latest elevation fetch; a newer location may start another one meanwhile.
    while (pendingElevationFetches.has(uuid)) await pendingElevationFetches.get(uuid);

    const state = getState();
    const draft = state.asset.draft;
    if (!draft || draft.uuid !== uuid) return false;
    if (!state.user.missionPerms?.permissions.edit) {
      dispatch(setAssetDraftMessage("You do not have permission to edit assets."));
      return false;
    }
    if (!isConnected(state)) {
      dispatch(setAssetDraftMessage("Not connected. Save again once the connection returns."));
      return false;
    }
    const values: AssetDraftValues = { ...draft.values, name: draft.values.name.trim() };
    const invalid = validateAssetDraftValues(values);
    if (invalid) {
      dispatch(setAssetDraftMessage(invalid));
      return false;
    }
    const missionDocHandle = getMissionDocHandle();
    const mission = missionDocHandle?.doc();
    if (!mission || mission.id !== draft.missionId) {
      dispatch(setAssetDraftMessage("The mission changed. Cancel to discard this draft."));
      return false;
    }
    const current = mission.assets?.[uuid];

    if (draft.isNew) {
      if (!current) {
        const now = getAccurateNow().getTime();
        const asset = generateBlankAsset({ ...values, uuid, createdAt: now, updatedAt: now });
        missionDocHandle.change((m: Mission) => applyCreateAsset(m, asset));
      }
    } else {
      if (!current) {
        dispatch(
          setAssetDraftMessage(
            "This asset was deleted by someone else. Cancel to discard your changes."
          )
        );
        return false;
      }
      const currentValues = getAssetDraftValues(current);
      let changes = getChangedAssetFields(draft.base, values);
      if (!isEqual(currentValues, draft.base)) {
        const merged = mergeAssetDraftWithDocument(draft.base, values, currentValues);
        if (merged.conflicts.length > 0) {
          const fields = [...new Set(merged.conflicts.map((field) => FIELD_LABELS[field]))];
          dispatch(
            rebaseAssetDraft({
              base: currentValues,
              values: merged.values,
              message: `Someone else changed this asset's ${fields.join(", ")} while you were editing. Review and Save again to keep your values, or Cancel.`,
            })
          );
          return false;
        }
        changes = getChangedAssetFields(currentValues, merged.values);
      }
      if (Object.keys(changes).length > 0) {
        missionDocHandle.change((m: Mission) => applyUpdateAsset(m, { assetUuid: uuid, changes }));
      }
    }

    await dispatch(thunkCancelAssetGesture());
    dispatch(clearAssetDraft());
    dispatch(setSelectedAssetUuid(uuid));
    return true;
  }
);

/** Delete an asset with its folder membership, and clear everything that referenced it. */
export const thunkDeleteAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/delete",
  async ({ assetUuid }, { dispatch, getState }) => {
    const state = getState();
    if (!state.user.missionPerms?.permissions.edit) return;
    if (state.asset.draft?.uuid === assetUuid) await dispatch(thunkCancelAssetDraft());
    if (getState().asset.selectedAssetUuid === assetUuid) dispatch(setSelectedAssetUuid(null));
    if (getState().hover.mapItemUuid === assetUuid) dispatch(setHoverAssetUuid(null));
    getMissionDocHandle()?.change((m: Mission) => applyDeleteAsset(m, assetUuid));
  }
);

/** Toggle an asset's shared map visibility. */
export const thunkToggleAssetVisible = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/toggleVisible",
  async ({ assetUuid }, { getState }) => {
    if (!getState().user.missionPerms?.permissions.edit) return;
    getMissionDocHandle()?.change((m: Mission) => applyToggleAssetVisible(m, assetUuid));
  }
);

/** Move an asset into an asset folder, or back to the root with a null folder. */
export const thunkMoveAssetToFolder = appCreateAsyncThunk<{
  assetUuid: string;
  folderUuid: string | null;
}>("asset/moveToFolder", async ({ assetUuid, folderUuid }, { getState }) => {
  if (!getState().user.missionPerms?.permissions.edit) return;
  getMissionDocHandle()?.change((m: Mission) =>
    applyMoveAssetToFolder(m, { assetUuid, folderUuid })
  );
});

/**
 * Reveal an asset in the floating widget: restore it, show the Assets tab, expand the asset's
 * folder, and select the row. The left-panel section does not change.
 */
export const thunkRevealAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/reveal",
  async ({ assetUuid }, { dispatch, getState }) => {
    const mission = getMissionDocHandle()?.doc();
    if (!mission?.assets?.[assetUuid]) return;
    dispatch(setRexMenuIsMinimized(false));
    dispatch(requestAssetsTab());
    const folderUuid = getAssetFolderUuidByItem(Object.values(mission.folders ?? {}))[assetUuid];
    if (
      folderUuid &&
      !getFolderInterface(getState().interface.foldersInterface, folderUuid).isOpen
    ) {
      await dispatch(thunkToggleFolderOpen({ folderUuid }));
    }
    dispatch(setSelectedAssetUuid(assetUuid));
  }
);
