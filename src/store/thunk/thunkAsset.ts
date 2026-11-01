import { v4 as uuidv4 } from "uuid";
import {
  captureAssetPlacement,
  getAssetEditValues,
  getAssetFolderUuidByItem,
  getChangedAssetFields,
  getMostRecentAsset,
  validateAssetEditValues,
} from "utils/assets";
import appCreateAsyncThunk from "./thunkUtil";
import { getMissionDocHandle } from "client/automergeDocHandles";
import {
  clearAssetInEdit,
  requestAssetsTab,
  setAssetInEdit,
  setAssetInEditElevation,
  setAssetInEditLocation,
  setExpandedAssetUuid,
  setSelectedAssetUuid,
} from "store/asset";
import { setHoverAssetUuid } from "store/hover";
import { getFolderInterface, setRexMenuIsMinimized } from "store/interface";
import { updateMapDirective } from "store/map";
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
import { getAccurateNow } from "utils/formatting";

// Elevation fetches still in flight, keyed by asset uuid. Save waits for them to settle.
const pendingElevationFetches = new Map<string, Promise<void>>();

/** End an active or scheduled asset map gesture without touching the in-edit session. */
export const thunkCancelAssetGesture = appCreateAsyncThunk<void>(
  "asset/cancelGesture",
  async (__, { dispatch, getState }) => {
    cancelPendingMapDirective();
    if (getState().map.mapDirective?.mapItemType === "asset") {
      dispatch(updateMapDirective(null));
    }
  }
);

/** Open a new-asset edit session prefilled from the most recently created asset. */
export const thunkAddAsset = appCreateAsyncThunk<void>(
  "asset/add",
  async (__, { dispatch, getState }) => {
    if (getState().asset.inEdit) return;
    const mission = getMissionDocHandle()?.doc();
    if (!mission) return;
    const latest = getMostRecentAsset(Object.values(mission.assets ?? {}));
    const uuid = uuidv4();
    dispatch(setSelectedAssetUuid(uuid));
    dispatch(
      setAssetInEdit({
        uuid,
        isNew: true,
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
      })
    );
  }
);

/** Open the editor on an existing asset. Selects and expands it first so a gesture keys on it. */
export const thunkEditAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/edit",
  async ({ assetUuid }, { dispatch, getState }) => {
    const mission = getMissionDocHandle()?.doc();
    const asset = mission?.assets?.[assetUuid];
    if (!asset) return;
    await dispatch(thunkCancelAssetGesture());
    const folderUuid = getAssetFolderUuidByItem(Object.values(mission.folders ?? {}))[assetUuid];
    if (
      folderUuid &&
      !getFolderInterface(getState().interface.foldersInterface, folderUuid).isOpen
    ) {
      await dispatch(thunkToggleFolderOpen({ folderUuid }));
    }
    const values = getAssetEditValues(asset);
    dispatch(setSelectedAssetUuid(assetUuid));
    dispatch(
      setAssetInEdit({
        uuid: assetUuid,
        isNew: false,
        values,
        base: getAssetEditValues(asset),
        elevationPending: false,
      })
    );
  }
);

/** Discard the in-edit session and any gesture. Nothing was written, so nothing is rolled back. */
export const thunkCancelAssetEdit = appCreateAsyncThunk<void>(
  "asset/cancelEdit",
  async (__, { dispatch }) => {
    dispatch(clearAssetInEdit());
    await dispatch(thunkCancelAssetGesture());
  }
);

/** Start Place on Map (unplaced asset) or Edit Pos. (placed asset) for the open session. */
export const thunkStartAssetGesture = appCreateAsyncThunk<void>(
  "asset/startGesture",
  async (__, { dispatch, getState }) => {
    const state = getState();
    const inEdit = state.asset.inEdit;
    if (!inEdit) return;
    await dispatch(
      thunkUpdateMapDirective({
        mapItemType: "asset",
        uuid: inEdit.uuid,
        mapAction: inEdit.values.location ? "editMarker" : "createMarker",
      })
    );
  }
);

/**
 * Accept a new in-edit location from a map click, a completed drag, or coordinate entry:
 * capture placement context at this instant and fetch the elevation. The document is not
 * touched until Save.
 */
export const thunkSetAssetEditLocation = appCreateAsyncThunk<{
  uuid: string;
  location: AEGISPoint;
}>("asset/setEditLocation", async ({ uuid, location }, { dispatch, getState }) => {
  const inEdit = getState().asset.inEdit;
  if (!inEdit || inEdit.uuid !== uuid) return;
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return;
  if (!Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return;

  const point = { lat: location.lat, lng: location.lng };
  const placement = captureAssetPlacement(mission, getAccurateNow().getTime());
  const hasDem = !!mission.demFilePath;
  dispatch(
    setAssetInEditLocation({
      uuid,
      location: point,
      placement,
      elevationPending: hasDem,
    })
  );
  if (!hasDem) return;

  const fetchElevation = (async () => {
    const result = await dispatch(thunkFetchPointElevation({ point, uuid }));
    const elevation =
      result.meta.requestStatus === "fulfilled" ? ((result.payload as number) ?? null) : null;
    dispatch(setAssetInEditElevation({ uuid, location: point, elevation }));
  })();
  pendingElevationFetches.set(uuid, fetchElevation);
  try {
    await fetchElevation;
  } finally {
    if (pendingElevationFetches.get(uuid) === fetchElevation) pendingElevationFetches.delete(uuid);
  }
});

/**
 * Save the open edit session in one document change. Editability is enforced by the editor's
 * Save button and AssetEditGuard, which cancels the session when Edit Mode or edit permission
 * is lost. Throws when the values are invalid, and cancels the session when the asset was
 * deleted underneath it.
 * @returns true when saved.
 */
export const thunkSaveAssetEdit = appCreateAsyncThunk<void, boolean>(
  "asset/saveEdit",
  async (__, { dispatch, getState }) => {
    const uuid = getState().asset.inEdit?.uuid;
    if (!uuid) return false;

    // Wait for the latest elevation fetch; a newer location may start another one meanwhile.
    while (pendingElevationFetches.has(uuid)) await pendingElevationFetches.get(uuid);

    const state = getState();
    const inEdit = state.asset.inEdit;
    if (!inEdit || inEdit.uuid !== uuid) return false;
    const values: AssetEditValues = { ...inEdit.values, name: inEdit.values.name.trim() };
    const invalid = validateAssetEditValues(values);
    if (invalid) throw new Error(invalid);
    const missionDocHandle = getMissionDocHandle();
    const mission = missionDocHandle?.doc();
    if (!missionDocHandle || !mission) return false;
    const current = mission.assets?.[uuid];

    if (inEdit.isNew) {
      if (!current) {
        const now = getAccurateNow().getTime();
        const asset = generateBlankAsset({ ...values, uuid, createdAt: now, updatedAt: now });
        missionDocHandle.change((m: Mission) => applyCreateAsset(m, asset));
      }
    } else {
      if (!current) {
        // The asset was deleted underneath the edit; discard the session.
        await dispatch(thunkCancelAssetEdit());
        return false;
      }
      const changes = getChangedAssetFields(inEdit.base, values);
      if (Object.keys(changes).length > 0) {
        missionDocHandle.change((m: Mission) => applyUpdateAsset(m, { assetUuid: uuid, changes }));
      }
    }

    await dispatch(thunkCancelAssetGesture());
    dispatch(clearAssetInEdit());
    dispatch(setSelectedAssetUuid(uuid));
    return true;
  }
);

/** Delete an asset with its folder membership, and clear everything that referenced it. */
export const thunkDeleteAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/delete",
  async ({ assetUuid }, { dispatch, getState }) => {
    const state = getState();
    if (!state.user.missionPerms?.permissions.edit || !state.mission.isInEditMode) return;
    if (state.asset.inEdit?.uuid === assetUuid) await dispatch(thunkCancelAssetEdit());
    if (getState().asset.selectedAssetUuid === assetUuid) dispatch(setSelectedAssetUuid(null));
    if (getState().asset.expandedAssetUuid === assetUuid) dispatch(setExpandedAssetUuid(null));
    if (getState().hover.mapItemUuid === assetUuid) dispatch(setHoverAssetUuid(null));
    getMissionDocHandle()?.change((m: Mission) => applyDeleteAsset(m, assetUuid));
  }
);

/** Toggle an asset's shared map visibility. */
export const thunkToggleAssetVisible = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/toggleVisible",
  async ({ assetUuid }, { getState }) => {
    if (!getState().user.missionPerms?.permissions.edit || !getState().mission.isInEditMode) return;
    getMissionDocHandle()?.change((m: Mission) => applyToggleAssetVisible(m, assetUuid));
  }
);

/** Move an asset into an asset folder, or back to the root with a null folder. */
export const thunkMoveAssetToFolder = appCreateAsyncThunk<{
  assetUuid: string;
  folderUuid: string | null;
}>("asset/moveToFolder", async ({ assetUuid, folderUuid }, { getState }) => {
  if (!getState().user.missionPerms?.permissions.edit || !getState().mission.isInEditMode) return;
  getMissionDocHandle()?.change((m: Mission) =>
    applyMoveAssetToFolder(m, { assetUuid, folderUuid })
  );
});

/**
 * Jump to an asset in the floating widget: restore it, show the Assets tab, expand the asset's
 * folder, and select the row. The left-panel section does not change.
 */
export const thunkJumpToAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/jumpTo",
  async ({ assetUuid }, { dispatch, getState }) => {
    const mission = getMissionDocHandle()?.doc();
    if (!mission?.assets?.[assetUuid]) return;
    if (getState().asset.inEdit && getState().asset.inEdit.uuid !== assetUuid) {
      await dispatch(thunkCancelAssetEdit());
    }
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
