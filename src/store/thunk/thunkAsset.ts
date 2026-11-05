import { v4 as uuidv4 } from "uuid";
import {
  getCurrentAssetPet,
  getAssetEditValues,
  getAssetFolderUuidByItem,
  getChangedAssetFields,
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
  syncAssetInEditFields,
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
import { isConnected } from "store/selectors";

// Elevation fetches still in flight, keyed by asset uuid. Save waits for them to settle.
const pendingElevationFetches = new Map<string, Promise<void>>();

/** The most recently created asset (`createdAt`, uuid tie-breaker), or null. */
export function getMostRecentAsset(assets: Asset[]): Asset | null {
  let latest: Asset | null = null;
  for (const asset of assets) {
    if (
      !latest ||
      asset.createdAt > latest.createdAt ||
      (asset.createdAt === latest.createdAt && asset.uuid > latest.uuid)
    ) {
      latest = asset;
    }
  }
  return latest;
}

/** End an active or scheduled asset map directive without touching the in-edit session. */
export const thunkCancelAssetMapDirective = appCreateAsyncThunk<void>(
  "asset/cancelMapDirective",
  async (__, { dispatch, getState }) => {
    cancelPendingMapDirective();
    if (getState().map.mapDirective?.mapItemType === "asset") {
      dispatch(updateMapDirective(null));
    }
  }
);

/** Open a new-asset edit session, prefilling radius and color from the most recently created asset. */
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
          name: "",
          icon: null,
          color: latest?.color ?? null,
          location: null,
          locationSetAt: null,
          elevation: null,
          uncertaintyMeters: latest?.uncertaintyMeters ?? 0,
          notes: null,
          ...getCurrentAssetPet(mission, getAccurateNow().getTime()),
        },
        base: null,
        elevationPending: false,
      })
    );
  }
);

/** Open the editor on an existing asset, selecting and expanding its row. */
export const thunkEditAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/edit",
  async ({ assetUuid }, { dispatch, getState }) => {
    const mission = getMissionDocHandle()?.doc();
    const asset = mission?.assets?.[assetUuid];
    if (!asset) return;
    await dispatch(thunkCancelAssetMapDirective());
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

/** Discard the in-edit session and any map directive. Nothing was written, so nothing is rolled back. */
export const thunkCancelAssetEdit = appCreateAsyncThunk<void>(
  "asset/cancelEdit",
  async (__, { dispatch }) => {
    dispatch(clearAssetInEdit({ keepExpanded: true }));
    await dispatch(thunkCancelAssetMapDirective());
  }
);

/** Start Place on Map (unplaced asset) or Edit Pos. (placed asset) for the open session. */
export const thunkStartAssetMapDirective = appCreateAsyncThunk<void>(
  "asset/startMapDirective",
  async (__, { dispatch, getState }) => {
    const state = getState();
    const inEdit = state.asset.inEdit;
    if (!inEdit) return;
    const location = inEdit.isNew
      ? inEdit.values.location
      : getMissionDocHandle()?.doc()?.assets?.[inEdit.uuid]?.location;
    await dispatch(
      thunkUpdateMapDirective({
        mapItemType: "asset",
        uuid: inEdit.uuid,
        mapAction: location ? "editMarker" : "createMarker",
      })
    );
  }
);

/**
 * Accept or clear an in-edit location from a map click, a completed drag, or coordinate entry:
 * record the location timestamp and fetch the elevation when placed. Existing assets can save
 * the position immediately; new assets keep their draft until the creation form is saved.
 */
export const thunkSetAssetEditLocation = appCreateAsyncThunk<{
  uuid: string;
  location: AEGISPoint | null;
  saveImmediately?: boolean;
}>("asset/setEditLocation", async ({ uuid, location, saveImmediately }, { dispatch, getState }) => {
  const inEdit = getState().asset.inEdit;
  if (!inEdit || inEdit.uuid !== uuid) return;
  const mission = getMissionDocHandle()?.doc();
  if (!mission) return;
  if (location && (!Number.isFinite(location.lat) || !Number.isFinite(location.lng))) return;

  const point = location ? { lat: location.lat, lng: location.lng } : null;
  const hasDem = !!point && !!mission.demFilePath;
  dispatch(
    setAssetInEditLocation({
      uuid,
      location: point,
      locationSetAt: point ? getAccurateNow().getTime() : null,
      elevationPending: hasDem,
    })
  );
  const fetchElevation = (async () => {
    if (!hasDem || !point) return;
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
  const latest = getState().asset.inEdit;
  if (
    saveImmediately &&
    latest?.uuid === uuid &&
    !latest.isNew &&
    latest.values.location?.lat === point?.lat &&
    latest.values.location?.lng === point?.lng &&
    !latest.elevationPending &&
    getState().user.missionPerms?.permissions.edit &&
    isConnected(getState())
  ) {
    const { location, locationSetAt, elevation } = latest.values;
    const changes = { location, locationSetAt, elevation };
    getMissionDocHandle()?.change((m: Mission) =>
      applyUpdateAsset(m, { assetUuid: uuid, changes })
    );
    dispatch(syncAssetInEditFields({ uuid, changes }));
    await dispatch(thunkCancelAssetMapDirective());
  }
});

/** Save one metadata field (or PET and its source) without ending item edit mode. */
export const thunkUpdateAssetFields = appCreateAsyncThunk<
  {
    assetUuid: string;
    changes?: Partial<
      Pick<
        AssetEditValues,
        "name" | "icon" | "color" | "uncertaintyMeters" | "notes" | "petSeconds"
      >
    >;
    petUpdate?: "current" | "clear";
  },
  boolean
>("asset/updateFields", async ({ assetUuid, changes = {}, petUpdate }, { dispatch, getState }) => {
  const state = getState();
  if (!state.user.missionPerms?.permissions.edit || !isConnected(state)) return false;
  if (state.asset.inEdit?.uuid !== assetUuid || state.asset.inEdit.isNew) return false;
  const handle = getMissionDocHandle();
  const mission = handle?.doc();
  const asset = mission?.assets?.[assetUuid];
  if (!asset) return false;
  const values = { ...getAssetEditValues(asset), ...changes };
  if ("name" in changes) values.name = values.name.trim();
  if (petUpdate === "current") {
    const pet = getCurrentAssetPet(mission, getAccurateNow().getTime());
    if (pet.petSeconds === null) throw new Error("No running REX with a valid PET");
    Object.assign(values, pet);
  } else if (petUpdate === "clear") {
    values.petSeconds = null;
    values.petRex = null;
  } else if ("petSeconds" in changes && values.petSeconds !== asset.petSeconds) {
    values.petRex = null;
  }
  const invalid = validateAssetEditValues(values);
  if (invalid) throw new Error(invalid);
  const changed = getChangedAssetFields(getAssetEditValues(asset), values);
  handle.change((m: Mission) => applyUpdateAsset(m, { assetUuid, changes: changed }));
  dispatch(syncAssetInEditFields({ uuid: assetUuid, changes: changed }));
  return true;
});

/**
 * Save the open edit session in one document change. Editability is enforced by the editor's
 * Save button. Throws when the values are invalid, and cancels the session when the asset was
 * deleted underneath it.
 * @returns true when saved.
 */
export const thunkSaveAssetEdit = appCreateAsyncThunk<
  { petUpdate?: "current" | "clear" } | void,
  boolean
>("asset/saveEdit", async (options, { dispatch, getState }) => {
  const uuid = getState().asset.inEdit?.uuid;
  if (!uuid) return false;

  // Wait for the latest elevation fetch; a newer location may start another one meanwhile.
  while (pendingElevationFetches.has(uuid)) await pendingElevationFetches.get(uuid);

  const state = getState();
  const inEdit = state.asset.inEdit;
  if (!inEdit || inEdit.uuid !== uuid) return false;
  const values: AssetEditValues = { ...inEdit.values, name: inEdit.values.name.trim() };
  const missionDocHandle = getMissionDocHandle();
  const mission = missionDocHandle?.doc();
  if (!missionDocHandle || !mission) return false;
  const petUpdate = options ? options.petUpdate : undefined;
  if (petUpdate === "current") {
    const pet = getCurrentAssetPet(mission, getAccurateNow().getTime());
    if (pet.petSeconds === null) throw new Error("No running REX with a valid PET");
    Object.assign(values, pet);
  } else if (petUpdate === "clear") {
    values.petSeconds = null;
    values.petRex = null;
  }
  const invalid = validateAssetEditValues(values);
  if (invalid) throw new Error(invalid);
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

  await dispatch(thunkCancelAssetMapDirective());
  dispatch(clearAssetInEdit());
  dispatch(setSelectedAssetUuid(uuid));
  return true;
});

/** Delete an asset with its folder membership, and clear everything that referenced it. */
export const thunkDeleteAsset = appCreateAsyncThunk<{ assetUuid: string }>(
  "asset/delete",
  async ({ assetUuid }, { dispatch, getState }) => {
    const state = getState();
    if (!state.user.missionPerms?.permissions.edit) return;
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
  async ({ assetUuid }, { dispatch, getState }) => {
    const state = getState();
    if (!state.user.missionPerms?.permissions.edit) return;
    if (state.asset.inEdit?.uuid === assetUuid) dispatch(thunkCancelAssetMapDirective());
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
      dispatch(setExpandedAssetUuid(null));
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
