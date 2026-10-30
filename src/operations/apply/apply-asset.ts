import cloneDeep from "lodash/cloneDeep";

import { getAccurateNow } from "utils/formatting";

import { applyMoveItemToFolder, applyRemoveItemsFromAllFolders } from "./apply-mission-folder";

/** Create an asset at the root (in no folder). */
export function applyCreateAsset(m: Mission, asset: Asset): void {
  if (!m.assets) m.assets = {};
  m.assets[asset.uuid] = cloneDeep(asset);
  applyRemoveItemsFromAllFolders(m, [asset.uuid]);
}

/** Write only the given fields of an existing asset. Does nothing for a deleted asset. */
export function applyUpdateAsset(
  m: Mission,
  { assetUuid, changes }: { assetUuid: string; changes: Partial<AssetDraftValues> }
): void {
  const asset = m.assets?.[assetUuid];
  if (!asset) return;
  const fields = Object.keys(changes) as (keyof AssetDraftValues)[];
  if (fields.length === 0) return;
  for (const field of fields) {
    (asset as unknown as Record<string, unknown>)[field] = cloneDeep(changes[field] ?? null);
  }
  asset.updatedAt = getAccurateNow().getTime();
}

/** Toggle an asset's shared map visibility. */
export function applyToggleAssetVisible(m: Mission, assetUuid: string): void {
  const asset = m.assets?.[assetUuid];
  if (!asset) return;
  asset.visible = !asset.visible;
  asset.updatedAt = getAccurateNow().getTime();
}

/**
 * Move an asset into an asset folder, or to the root with a null folderUuid. A missing asset,
 * or a target that is missing or not an asset folder, leaves membership unchanged.
 */
export function applyMoveAssetToFolder(
  m: Mission,
  { assetUuid, folderUuid }: { assetUuid: string; folderUuid: string | null }
): void {
  if (!m.assets?.[assetUuid]) return;
  if (folderUuid !== null && m.folders?.[folderUuid]?.type !== "asset") return;
  applyMoveItemToFolder(m, { folderUuid, itemUuid: assetUuid });
}

/** Delete an asset and its folder membership. */
export function applyDeleteAsset(m: Mission, assetUuid: string): void {
  if (m.assets) delete m.assets[assetUuid];
  applyRemoveItemsFromAllFolders(m, [assetUuid]);
}
