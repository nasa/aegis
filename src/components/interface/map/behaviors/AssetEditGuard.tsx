/**
 * AssetEditGuard — ends an asset map gesture when it can no longer apply, and discards the
 * asset's in-edit session when Edit Mode or edit permission is lost or when the editor map unmounts
 * (e.g. leaving the mission).
 *
 * The gesture ends, keeping the session, when: Assets is turned off, the edited asset or its
 * folder is hidden, the floating widget is minimized, the connection is lost, or the session it
 * targets is gone. Showing the asset again does not restart it.
 *
 * Editor only. Returns null — headless behavior component.
 */

import { useEffect } from "react";

import { useAppSelector, deepEqual, refEqual } from "utils/useAppSelector";
import { useAppDispatch } from "utils/useAppDispatch";
import { useMissionDocSelector } from "utils/useDocSelector";
import { isConnected } from "store/selectors";
import { thunkCancelAssetEdit, thunkCancelAssetGesture } from "store/thunk/thunkAsset";
import { getAssetFolderUuidByItem, getAssetHiddenReason } from "utils/assets";

import { useMapMenuContext } from "../MapMenuProvider";

export function AssetEditGuard(): null {
  const dispatch = useAppDispatch();
  const { submenuAssets } = useMapMenuContext();
  const mapDirective = useAppSelector((s) => s.map.mapDirective, refEqual);
  const inEditUuid = useAppSelector((s) => s.asset.inEdit?.uuid ?? null, refEqual);
  const minimized = useAppSelector((s) => s.interface.rexMenuIsMinimized, refEqual);
  const canEdit = useAppSelector(
    (s) => !!s.user.missionPerms?.permissions.edit && s.mission.isInEditMode,
    refEqual
  );
  const connected = useAppSelector(isConnected, refEqual);
  const hiddenReason = useMissionDocSelector((m) => {
    const asset = inEditUuid ? m.assets?.[inEditUuid] : null;
    if (!asset) return null;
    const folderUuid = getAssetFolderUuidByItem(Object.values(m.folders ?? {}))[asset.uuid];
    return getAssetHiddenReason(asset, folderUuid ? m.folders[folderUuid] : null);
  }, deepEqual);

  const assetGestureActive = mapDirective?.mapItemType === "asset";
  const gestureBlocked =
    !submenuAssets.show ||
    !!hiddenReason ||
    minimized ||
    !canEdit ||
    !connected ||
    inEditUuid !== mapDirective?.uuid;

  useEffect(() => {
    if (inEditUuid && !canEdit) dispatch(thunkCancelAssetEdit());
  }, [inEditUuid, canEdit, dispatch]);

  useEffect(() => {
    if (assetGestureActive && gestureBlocked) dispatch(thunkCancelAssetGesture());
  }, [assetGestureActive, gestureBlocked, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(thunkCancelAssetEdit());
    };
  }, [dispatch]);

  return null;
}
